import UIKit
import WebKit

/// Keeps the window's top bar clear of iPadOS's window controls.
///
/// In a window rather than full screen, iPadOS draws its close, minimise and
/// arrange controls over the app's top-left corner. The safe area leaves
/// them out, since they cover only that corner, so the page is told how wide
/// they are, as `--window-controls-inset` on its root, and the bar in that
/// corner starts after them (packages/app/src/shell/styles.css).
final class WindowControlsInset {
    private weak var view: UIView?
    private weak var webView: WKWebView?
    private var sent: CGFloat?
    private var loading: NSKeyValueObservation?

    init(view: UIView, webView: WKWebView) {
        self.view = view
        self.webView = webView
        // A new page has none of what was sent to the last one.
        loading = webView.observe(\.isLoading) { [weak self] webView, _ in
            guard !webView.isLoading else { return }
            self?.sent = nil
            self?.update()
        }
    }

    /// Sends the controls' width when it changes (on every layout of the view).
    func update() {
        guard let view, let webView, !webView.isLoading else { return }
        let inset = Self.leadingInset(of: view)
        guard inset != sent else { return }
        sent = inset
        webView.evaluateJavaScript(Self.script(inset: inset))
    }

    /// How far the controls reach past the safe area's leading edge. Full
    /// screen there are none: the corner adaptation is then only the
    /// rounding of the corner (about 9 points), which the bar need not clear.
    /// A window grown to the screen's size is still a window: while its
    /// controls hide, the bar keeps that small rounding inset, as UIKit's
    /// own bars do.
    static func leadingInset(of view: UIView) -> CGFloat {
        guard #available(iOS 26.0, *), view.window?.windowScene?.isFullScreen == false else { return 0 }
        let adapted = view.directionalEdgeInsets(for: .safeArea(cornerAdaptation: .horizontal)).leading
        let isRightToLeft = view.effectiveUserInterfaceLayoutDirection == .rightToLeft
        let safe = isRightToLeft ? view.safeAreaInsets.right : view.safeAreaInsets.left
        return max(0, adapted - safe)
    }

    static func script(inset: CGFloat) -> String {
        let pixels = Int(inset.rounded(.up))
        return "document.documentElement.style.setProperty('--window-controls-inset', '\(pixels)px')"
    }
}
