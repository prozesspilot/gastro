#!/usr/bin/env bash
# Imports every WF-*.json under ./workflows into n8n via its REST API.
# Compatible with bash 3.2 (macOS default) — no associative arrays.
#
# Strategy:
#   Pass 1 — create/update all workflows with active:false (avoid publish errors)
#   Pass 2 — rewrite cross-workflow executeWorkflow references to live ids
#   Pass 3 — activate in dependency order (sub-workflows before masters)
#
# Required env:
#   N8N_API_KEY    Personal API key (Settings → n8n API)
# Optional env:
#   N8N_URL        Base URL of the n8n instance (default http://localhost:5678)

set -euo pipefail

N8N_URL="${N8N_URL:-http://localhost:5678}"
API="${N8N_URL}/api/v1"
WORKFLOW_DIR="$(cd "$(dirname "$0")" && pwd)/workflows"

if [[ -z "${N8N_API_KEY:-}" ]]; then
  echo "Error: N8N_API_KEY env not set" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is required" >&2
  exit 1
fi

MAP_FILE="$(mktemp)"
trap 'rm -f "$MAP_FILE"' EXIT

curl_n8n() {
  curl -sS -H "X-N8N-API-KEY: ${N8N_API_KEY}" -H "Accept: application/json" "$@"
}

# Strip to only accepted fields (active is read-only via PUT — use /activate endpoint)
strip_workflow() {
  jq '{ name, nodes, connections, settings: (.settings // {}) }' "$1"
}

lookup_id() {
  local name="$1"
  grep -F "$(printf '%s\t' "${name}")" "$MAP_FILE" 2>/dev/null | cut -f2 | head -1 || true
}

store_id() {
  local name="$1" id="$2"
  local tmp; tmp="$(mktemp)"
  grep -vF "$(printf '%s\t' "${name}")" "$MAP_FILE" > "$tmp" 2>/dev/null || true
  printf '%s\t%s\n' "${name}" "${id}" >> "$tmp"
  mv "$tmp" "$MAP_FILE"
}

# ── Pass 0: Deactivate all existing workflows so PUT never hits publish checks ─
echo "→ Pass 0/3: deactivating existing workflows"

existing_json="$(curl_n8n "${API}/workflows?limit=250")"

while IFS=$'\t' read -r id active; do
  if [[ "${active}" == "true" ]]; then
    echo "  · deactivate id=${id}"
    curl_n8n -X POST "${API}/workflows/${id}/deactivate" > /dev/null 2>&1 || true
  fi
done < <(echo "${existing_json}" | jq -r '.data[]? | [.id, (.active | tostring)] | @tsv')

# Seed name→id map after we have existing_json
while IFS=$'\t' read -r id name; do
  [[ -n "${id}" && -n "${name}" ]] && store_id "${name}" "${id}"
done < <(echo "${existing_json}" | jq -r '.data[]? | [.id, .name] | @tsv')

# ── Pass 1: Import all workflows ──────────────────────────────────────────────
echo "→ Pass 1/3: importing workflows from ${WORKFLOW_DIR}"

shopt -s nullglob
files=( "${WORKFLOW_DIR}"/WF-*.json )
if (( ${#files[@]} == 0 )); then
  # T049/F3: Der Pilot laeuft Webapp/JWT-getrieben (Upload->OCR-Worker->Categorize->
  # Lexware-Export, alles ueber die Mitarbeiter-Webapp). Es gibt bewusst KEINE aktiven
  # n8n-Workflows mehr — die alten liegen in workflows/_eingefroren/ (tot gegen die
  # entfernte /receipts-Welt). Das ist KEIN Fehler.
  echo "Keine aktiven WF-*.json in ${WORKFLOW_DIR} — Pilot ist Webapp-getrieben, nichts zu deployen." >&2
  exit 0
fi

# Exclude *_clean.json variants — they're duplicates
main_files=()
for f in "${files[@]}"; do
  [[ "$f" == *_clean.json ]] && continue
  main_files+=("$f")
done

for file in "${main_files[@]}"; do
  base="$(basename "${file}")"
  name="$(jq -r '.name' "${file}")"
  body="$(strip_workflow "${file}")"
  existing_id="$(lookup_id "${name}")"

  if [[ -n "${existing_id}" ]]; then
    echo "  · update  ${base}  (id=${existing_id})"
    resp="$(curl_n8n -X PUT \
      -H "Content-Type: application/json" \
      --data "${body}" \
      "${API}/workflows/${existing_id}")"
    if ! echo "${resp}" | jq -e '.id' >/dev/null 2>&1; then
      echo "    ✗ update failed: ${resp}" >&2; exit 1
    fi
  else
    echo "  · create  ${base}  (name=${name})"
    resp="$(curl_n8n -X POST \
      -H "Content-Type: application/json" \
      --data "${body}" \
      "${API}/workflows")"
    new_id="$(echo "${resp}" | jq -r '.id // empty')"
    if [[ -z "${new_id}" ]]; then
      echo "    ✗ create failed: ${resp}" >&2; exit 1
    fi
    store_id "${name}" "${new_id}"
    echo "    → id=${new_id}"
  fi
done

# ── Pass 2: Rewrite executeWorkflow references ────────────────────────────────
echo "→ Pass 2/3: rewriting cross-workflow references"

map_literal="$(awk -F'\t' 'BEGIN{printf "{"} NR>1{printf ","} {printf "\"%s\":\"%s\"", $1, $2} END{printf "}"}' "$MAP_FILE")"

for file in "${main_files[@]}"; do
  name="$(jq -r '.name' "${file}")"
  id="$(lookup_id "${name}")"
  [[ -z "${id}" ]] && continue

  body="$(jq --argjson m "${map_literal}" '
    {
      name,
      nodes: (.nodes | map(
        if .type == "n8n-nodes-base.executeWorkflow" then
          if ((.parameters.workflowId | type) == "object")
             and ((.parameters.workflowId.cachedResultName // "") as $tgt | $m[$tgt] != null)
          then
            .parameters.workflowId.value = $m[.parameters.workflowId.cachedResultName]
            | .parameters.workflowId.mode = "id"
            | .parameters.workflowId.__rl = true
          elif ((.parameters.workflowId | type) == "string")
               and ($m[.parameters.workflowId] != null)
          then
            .parameters.workflowId = {
              "__rl": true,
              "value": $m[.parameters.workflowId],
              "mode": "id"
            }
          else . end
        else . end
      )),
      connections,
      settings: (.settings // {})
    }
  ' "${file}")"

  echo "  · repoint ${name} (id=${id})"
  resp="$(curl_n8n -X PUT \
    -H "Content-Type: application/json" \
    --data "${body}" \
    "${API}/workflows/${id}")"

  if ! echo "${resp}" | jq -e '.id' >/dev/null 2>&1; then
    echo "    ✗ PUT failed: ${resp}" >&2; exit 1
  fi
done

# ── Pass 3: Activate in dependency order ─────────────────────────────────────
echo "→ Pass 3/3: activating workflows"

# Sub-workflows first (all of them), then orchestrator, then triggers last
ACTIVATE_ORDER=(
  "WF-M01" "WF-M02" "WF-M03" "WF-M04" "WF-M05" "WF-M06" "WF-M07" "WF-M08"
  "WF-M09-SUPPLIER-COMM" "WF-ERROR-HANDLER" "WF-PLUGIN-DISPATCHER" "WF-CRON-M08" "WF-CRON-M09-EXPECTED"
  "WF-MASTER-RECEIPT"
  "WF-INPUT-WHATSAPP" "WF-INPUT-UPLOAD" "WF-INPUT-IMAP"
)

for wf_name in "${ACTIVATE_ORDER[@]}"; do
  id="$(lookup_id "${wf_name}")"
  if [[ -z "${id}" ]]; then
    echo "  ! ${wf_name} not found, skipping"
    continue
  fi
  echo "  · activate ${wf_name} (id=${id})"
  resp="$(curl_n8n -X POST "${API}/workflows/${id}/activate")"
  if ! echo "${resp}" | jq -e '.id' >/dev/null 2>&1; then
    echo "    ✗ activate failed: ${resp}" >&2
    # Non-fatal — continue with remaining workflows
  fi
done

echo ""
echo "✓ deploy complete"
echo ""
echo "Workflow → id:"
awk -F'\t' '{ printf "  %-30s %s\n", $1, $2 }' "$MAP_FILE"
