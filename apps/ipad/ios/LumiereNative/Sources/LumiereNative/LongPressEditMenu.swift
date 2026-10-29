import UIKit
import WebKit

/// Shows the edit menu after a long-press selects text, when WebKit did not.
///
/// A long-press on a word selects it, and iOS shows Cut, Copy, Paste and
/// More… when the finger lifts, unless the page changed the selection in
/// between. The editor often does: CodeMirror writes the selection back
/// after it redraws the note (Live Preview hiding or showing Markdown, Vim's
/// visual mode, the first selection after the note opens), and WebKit then
/// keeps its menu down, and will not show it when asked. So when a
/// long-press ends with text selected and no edit menu was built for it,
/// this shows its own edit menu over the selection. UIKit fills it from the
/// responder chain as it fills WebKit's: the actions go to WebKit, and
/// More… is there (EditMenu.swift).
final class LongPressEditMenu: NSObject, UIGestureRecognizerDelegate, UIEditMenuInteractionDelegate {
    /// How long WebKit has to show its own menu once the finger lifts.
    static let grace: TimeInterval = 0.35
    /// How far from the selection a press may be and still have selected
    /// it: about a fingertip.
    static let reach: CGFloat = 44

    private weak var webView: WKWebView?
    private lazy var menu = UIEditMenuInteraction(delegate: self)
    private var menusBuilt = 0
    private var menusBuiltAtPress = 0
    private var selection = CGRect.null

    init(webView: WKWebView) {
        self.webView = webView
        super.init()
        webView.addInteraction(menu)
        let press = UILongPressGestureRecognizer(target: self, action: #selector(pressed(_:)))
        // Only watches: WebKit still gets every touch and does the selecting.
        press.cancelsTouchesInView = false
        press.delaysTouchesEnded = false
        press.delegate = self
        webView.addGestureRecognizer(press)
    }

    /// An edit menu is being built (LumiereViewController.buildMenu).
    func menuBuilt() {
        menusBuilt += 1
    }

    /// Whether to show the menu: the press selected text where it was, and
    /// WebKit built no menu for it. A press elsewhere (on a file in the list,
    /// with a word still selected in the note) shows nothing.
    static func shouldShow(menuBuiltSincePress: Bool, selection: CGRect, press: CGPoint) -> Bool {
        !menuBuiltSincePress && !selection.isNull
            && selection.insetBy(dx: -reach, dy: -reach).contains(press)
    }

    /// Where the selection is, in `view`'s coordinates: the union of its
    /// rectangles, or null when nothing is selected.
    static func selectionRect(of input: UITextInput & UIView, in view: UIView) -> CGRect {
        guard let range = input.selectedTextRange, !range.isEmpty else { return .null }
        let rects = input.selectionRects(for: range).map(\.rect).filter { !$0.isEmpty }
        let union = rects.reduce(CGRect.null) { $0.union($1) }
        return union.isNull ? .null : view.convert(union, from: input)
    }

    @objc private func pressed(_ press: UILongPressGestureRecognizer) {
        switch press.state {
        case .began:
            menusBuiltAtPress = menusBuilt
        case .ended:
            let point = press.location(in: webView)
            DispatchQueue.main.asyncAfter(deadline: .now() + Self.grace) { [weak self] in
                self?.showMenuIfMissing(pressedAt: point)
            }
        default:
            break
        }
    }

    private func showMenuIfMissing(pressedAt point: CGPoint) {
        guard let webView, let input = Self.textInput(of: webView) else { return }
        selection = Self.selectionRect(of: input, in: webView)
        let built = menusBuilt != menusBuiltAtPress
        guard Self.shouldShow(menuBuiltSincePress: built, selection: selection, press: point) else { return }
        let at = CGPoint(x: selection.midX, y: selection.minY)
        menu.presentEditMenu(with: UIEditMenuConfiguration(identifier: nil, sourcePoint: at))
    }

    /// WebKit's content view, which takes the text input.
    private static func textInput(of webView: WKWebView) -> (UITextInput & UIView)? {
        webView.scrollView.subviews.lazy.compactMap { $0 as? UITextInput & UIView }.first
    }

    func editMenuInteraction(
        _ interaction: UIEditMenuInteraction, menuFor configuration: UIEditMenuConfiguration,
        suggestedActions: [UIMenuElement]
    ) -> UIMenu? {
        UIMenu(children: suggestedActions)
    }

    func editMenuInteraction(
        _ interaction: UIEditMenuInteraction, targetRectFor configuration: UIEditMenuConfiguration
    ) -> CGRect {
        selection
    }

    func gestureRecognizer(
        _ gestureRecognizer: UIGestureRecognizer,
        shouldRecognizeSimultaneouslyWith other: UIGestureRecognizer
    ) -> Bool {
        true
    }
}
