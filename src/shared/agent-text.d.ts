import { type PdfSelection } from './selection';
export interface PdfSource {
    /** Workspace-relative path, or an absolute path for files outside it. */
    path: string;
    /** SHA-256 of the PDF bytes, so an agent can tell if the file changed. */
    sha256: string;
}
export declare function agentText(selection: PdfSelection, source: PdfSource): string;
