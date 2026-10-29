import UIKit
import XCTest
@testable import LumiereNative

final class WindowControlsInsetTests: XCTestCase {
    /// The page gets whole pixels, rounded up so the bar clears the controls.
    func testTellsThePageTheControlsWidth() {
        XCTAssertEqual(
            WindowControlsInset.script(inset: 71.4),
            "document.documentElement.style.setProperty('--window-controls-inset', '72px')")
        XCTAssertEqual(
            WindowControlsInset.script(inset: 0),
            "document.documentElement.style.setProperty('--window-controls-inset', '0px')")
    }

    /// A view with no window has no controls over it.
    func testAViewOutsideAWindowHasNoInset() {
        let view = UIView(frame: CGRect(x: 0, y: 0, width: 400, height: 300))
        XCTAssertEqual(WindowControlsInset.leadingInset(of: view), 0)
    }
}
