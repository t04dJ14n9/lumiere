import UIKit
import WebKit
import XCTest
@testable import LumiereNative

final class LongPressEditMenuTests: XCTestCase {
    /// The menu shows only for text the press selected, and only when
    /// WebKit built none.
    func testShowsOnlyForTheSelectionThePressMade() {
        let word = CGRect(x: 100, y: 200, width: 40, height: 20)
        let onWord = CGPoint(x: 120, y: 210)
        XCTAssertTrue(LongPressEditMenu.shouldShow(menuBuiltSincePress: false, selection: word, press: onWord))
        XCTAssertFalse(LongPressEditMenu.shouldShow(menuBuiltSincePress: true, selection: word, press: onWord))
        XCTAssertFalse(LongPressEditMenu.shouldShow(menuBuiltSincePress: false, selection: .null, press: onWord))
        // A long-press on a file in the list, far from a word still selected.
        let onFile = CGPoint(x: 40, y: 700)
        XCTAssertFalse(LongPressEditMenu.shouldShow(menuBuiltSincePress: false, selection: word, press: onFile))
    }

    /// It watches long-presses without taking touches from WebKit, which
    /// still does the selecting, and has its own menu on the web view.
    func testWatchesTheWebViewWithoutTakingItsTouches() throws {
        let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 400, height: 300))
        let menu = LongPressEditMenu(webView: webView)
        let press = try XCTUnwrap(webView.gestureRecognizers?.compactMap { $0 as? UILongPressGestureRecognizer }.last)
        XCTAssertFalse(press.cancelsTouchesInView)
        XCTAssertTrue(press.delegate === menu)
        XCTAssertTrue(webView.interactions.contains { $0 is UIEditMenuInteraction })
    }

    func testTheMenuGoesOverTheSelectedText() {
        let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 400, height: 300))
        let text = UITextView(frame: CGRect(x: 20, y: 40, width: 300, height: 200))
        window.addSubview(text)
        window.isHidden = false
        text.text = "Plain text with bold"
        text.layoutIfNeeded()
        // A text view outside a shown window, or not editing, reports no rectangles.
        XCTAssertTrue(text.becomeFirstResponder())
        text.selectedRange = NSRange(location: 0, length: 5)
        let rect = LongPressEditMenu.selectionRect(of: text, in: window)
        XCTAssertFalse(rect.isNull)
        XCTAssertGreaterThanOrEqual(rect.minX, 20)
        XCTAssertGreaterThanOrEqual(rect.minY, 40)
        text.selectedRange = NSRange(location: 3, length: 0)
        XCTAssertTrue(LongPressEditMenu.selectionRect(of: text, in: window).isNull)
    }
}
