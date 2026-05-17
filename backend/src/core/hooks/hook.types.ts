/**
 * Hook-System — Typen (04_Erweiterbarkeit_Pro.md §3).
 */

export type HookPoint =
  | 'before_extraction'
  | 'after_extraction'
  | 'before_categorization'
  | 'after_categorization'
  | 'before_archive'
  | 'after_archive'
  | 'before_export.lexoffice'
  | 'after_export.lexoffice'
  | 'before_export.sevdesk'
  | 'after_export.sevdesk'
  | 'before_export.datev'
  | 'after_export.datev'
  | 'on_requires_review'
  | 'before_report.monthly'
  | 'after_report.monthly'
  | 'on_export_failed';

export type HookImplementation = 'http_webhook' | 'js_inline' | 'plugin_id' | 'disabled';

export interface CustomerHook {
  hook_id: string;
  customer_id: string;
  hook_point: HookPoint;
  implementation: HookImplementation;
  config: HookConfig;
  enabled: boolean;
  priority: number;
}

export interface HttpWebhookConfig {
  url: string;
  /** Referenz auf customer_credentials.kind, dessen plaintext als HMAC-Secret dient. */
  secret_ref?: string;
  /** Statisch hinterlegtes Secret (für Tests / einfache Hooks). */
  secret?: string;
  timeout_ms?: number;
  method?: 'POST' | 'PUT' | 'PATCH';
  on_failure?: 'ignore' | 'abort';
}

export interface JsInlineConfig {
  code: string;
  timeout_ms?: number;
}

export interface PluginIdConfig {
  plugin: string;
  version?: string;
  settings?: Record<string, unknown>;
}

export type HookConfig =
  | (HttpWebhookConfig & { [k: string]: unknown })
  | (JsInlineConfig & { [k: string]: unknown })
  | (PluginIdConfig & { [k: string]: unknown })
  | Record<string, unknown>;
