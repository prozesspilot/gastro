/**
 * M02 — Re-Export der Pfad-/Filename-Templates aus core/templates.
 *
 * Lebt im Modul, damit Modul-Code lokal importieren kann
 * (`./services/path-template`); Implementation liegt in `core/templates`,
 * weil sie zukünftig auch von M07/M08 (Reporting-Filenames) genutzt wird.
 */

export {
  renderPathTemplate,
  renderFilename,
  sanitizePathSegment,
  sanitizeFilename,
  transliterate,
} from '../../../core/templates/path-template';
