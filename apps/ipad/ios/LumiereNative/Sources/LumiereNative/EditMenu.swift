import UIKit

/// Lumière's items in the edit menu a long-press or a selection shows:
/// - More… opens Lumière's own menu for the selection (Bold, highlights,
///   Insert Link…), as a right-click does on the Mac. The window passes it to
///   the shown note (`page-menu`), whose page draws that menu at the
///   selection (packages/host-node/src/page/context-menu.ts,
///   `openMenuAtSelection`).
/// - Insert Sketch opens the canvas for a new drawing in the note
///   (`insert-sketch`), as Notes' own edit menu offers a drawing.
public enum EditMenu {
    static let identifier = UIMenu.Identifier("lumiere.more")
    static let title = "More…"
    static let insertSketchTitle = "Insert Sketch"

    public static func build(
        with builder: UIMenuBuilder, more: @escaping () -> Void, insertSketch: @escaping () -> Void
    ) {
        guard builder.system == .context, builder.menu(for: identifier) == nil else { return }
        let menu = UIMenu(
            title: "", identifier: identifier, options: .displayInline,
            children: actions(more: more, insertSketch: insertSketch))
        // Right after Cut, Copy and Paste, where the short menu shows it.
        if builder.menu(for: .standardEdit) != nil {
            builder.insertSibling(menu, afterMenu: .standardEdit)
        } else {
            builder.insertChild(menu, atEndOfMenu: .root)
        }
    }

    static func actions(more: @escaping () -> Void, insertSketch: @escaping () -> Void) -> [UIAction] {
        [
            UIAction(title: title, image: UIImage(systemName: "ellipsis.circle")) { _ in more() },
            UIAction(title: insertSketchTitle, image: UIImage(systemName: "pencil.tip.crop.circle")) { _ in
                insertSketch()
            },
        ]
    }
}
