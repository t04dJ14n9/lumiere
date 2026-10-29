import UIKit

/// More… in the edit menu a long-press or a selection shows: it opens
/// Lumière's own menu for the selection (Bold, highlights, Insert Link…), as
/// a right-click does on the Mac. The window passes it to the shown note
/// (`page-menu`), whose page draws that menu at the selection
/// (packages/host-node/src/page/context-menu.ts, `openMenuAtSelection`).
public enum EditMenu {
    static let identifier = UIMenu.Identifier("lumiere.more")
    static let title = "More…"

    public static func build(with builder: UIMenuBuilder, more: @escaping () -> Void) {
        guard builder.system == .context, builder.menu(for: identifier) == nil else { return }
        let action = UIAction(title: title, image: UIImage(systemName: "ellipsis.circle")) { _ in
            more()
        }
        let menu = UIMenu(title: "", identifier: identifier, options: .displayInline, children: [action])
        // Right after Cut, Copy and Paste, where the short menu shows it.
        if builder.menu(for: .standardEdit) != nil {
            builder.insertSibling(menu, afterMenu: .standardEdit)
        } else {
            builder.insertChild(menu, atEndOfMenu: .root)
        }
    }
}
