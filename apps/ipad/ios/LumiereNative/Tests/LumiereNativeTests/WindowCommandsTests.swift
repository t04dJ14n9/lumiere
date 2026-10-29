import UIKit
import XCTest
@testable import LumiereNative

final class WindowCommandsTests: XCTestCase {
    /// UIKit throws (and the app quits) when two items share an action and a
    /// property list, as a command's second key once did.
    func testEveryMenuItemIsDistinct() {
        let items = WindowCommand.allCases.flatMap { WindowMenu.items(for: $0) }
        let keys = items.compactMap { $0 as? UICommand }.map { "\($0.action)|\($0.propertyList ?? "")" }
        XCTAssertEqual(Set(keys).count, keys.count, "duplicates: \(keys)")
    }

    func testEveryKeyReachesItsCommand() {
        for command in WindowCommand.allCases {
            for item in WindowMenu.items(for: command) {
                XCTAssertEqual(WindowCommand(sender: item as! UICommand), command)
            }
        }
    }

    /// Inside a note ⌘B is Bold: no menu key takes it first.
    func testBoldStaysTheEditors() {
        XCTAssertFalse(commandKeys.contains { $0.input == "b" && $0.modifiers.contains(.command) })
    }
}
