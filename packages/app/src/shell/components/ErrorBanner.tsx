/** The last thing that went wrong (a folder that is not one, a lost server), until dismissed. */
export interface ErrorBannerProps {
  readonly message: string | undefined;
  readonly onDismiss: () => void;
}

export function ErrorBanner({ message, onDismiss }: ErrorBannerProps) {
  if (message === undefined) {
    return null;
  }
  return (
    <div className="error-banner" role="alert">
      <span>{message}</span>
      <button type="button" aria-label="Dismiss" onClick={onDismiss}>
        ×
      </button>
    </div>
  );
}
