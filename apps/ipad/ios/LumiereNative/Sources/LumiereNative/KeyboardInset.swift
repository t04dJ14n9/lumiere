import UIKit

/// Counts the on-screen keyboard (or the shortcut bar of a hardware
/// keyboard) as part of the bottom safe area. WKWebView passes safe areas to
/// the page as `env(safe-area-inset-bottom)`, which the window pads with, so
/// the editor ends above the keyboard instead of under it. WebKit's own
/// answer would scroll the whole page up, tab strip and all.
final class KeyboardInset {
    private weak var controller: UIViewController?
    private var observers: [NSObjectProtocol] = []

    init(controller: UIViewController) {
        self.controller = controller
        let center = NotificationCenter.default
        for name in [UIResponder.keyboardWillChangeFrameNotification, UIResponder.keyboardWillHideNotification] {
            observers.append(
                center.addObserver(forName: name, object: nil, queue: .main) { [weak self] note in
                    self?.keyboardWillMove(note)
                })
        }
    }

    deinit {
        observers.forEach(NotificationCenter.default.removeObserver)
    }

    private func keyboardWillMove(_ note: Notification) {
        guard let controller, let view = controller.view, let window = view.window else { return }
        let hiding = note.name == UIResponder.keyboardWillHideNotification
        let end = (note.userInfo?[UIResponder.keyboardFrameEndUserInfoKey] as? CGRect) ?? .zero
        let isDocked = Self.isDocked(keyboard: end, screen: window.screen.bounds)
        let frame = view.convert(end, from: window.screen.coordinateSpace)
        let inset = hiding || !isDocked ? 0 : Self.coveredHeight(keyboard: frame, in: view.bounds)
        // The safe area already holds the home indicator; add only the rest.
        let base = view.safeAreaInsets.bottom - controller.additionalSafeAreaInsets.bottom
        let additional = max(0, inset - base)
        guard additional != controller.additionalSafeAreaInsets.bottom else { return }
        let duration = (note.userInfo?[UIResponder.keyboardAnimationDurationUserInfoKey] as? Double) ?? 0.25
        UIView.animate(withDuration: duration) {
            controller.additionalSafeAreaInsets.bottom = additional
            view.layoutIfNeeded()
        }
    }

    /// Whether the keyboard sits along the screen's bottom edge. A floating
    /// or split keyboard, or the small bar a hardware keyboard shows, does
    /// not, and the window keeps its size under it.
    static func isDocked(keyboard: CGRect, screen: CGRect) -> Bool {
        !keyboard.isEmpty && keyboard.maxY >= screen.maxY - 1 && keyboard.width >= screen.width * 0.9
    }

    /// How much of the view the keyboard covers from below, in the view's
    /// coordinates (in Stage Manager the window may not reach the screen's
    /// bottom, and covers less).
    static func coveredHeight(keyboard: CGRect, in bounds: CGRect) -> CGFloat {
        let covered = bounds.intersection(keyboard)
        return covered.isNull ? 0 : max(0, bounds.maxY - covered.minY)
    }
}
