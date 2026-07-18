import { openPreview, openTerm } from './bus.js';

export function handleWorkflowClientStep(result) {
  if (result.clientPreview) {
    openPreview(result.clientPreview.label, result.clientPreview.url);
  } else if (result.clientTerm) {
    openTerm(result.clientTerm.label, result.clientTerm.cwd, result.clientTerm.cmd);
  } else if (result.clientUrl) {
    openPreview(result.clientUrl.label, result.clientUrl.url);
  }
}
