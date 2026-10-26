import UIKit

/// Ink colours as the sketch file writes them: `#rrggbb`, or `#rrggbbaa`
/// when not opaque, in sRGB, as drawn on light paper.
enum InkColor {
    /// The colour as it shows in light mode: PencilKit keeps an ink's light
    /// colour and only shows it inverted on a dark canvas.
    static func hex(_ color: UIColor) -> String {
        let light = color.resolvedColor(with: UITraitCollection(userInterfaceStyle: .light))
        var red: CGFloat = 0
        var green: CGFloat = 0
        var blue: CGFloat = 0
        var alpha: CGFloat = 1
        // Extended sRGB: a Display P3 colour can fall outside 0...1, and is clamped.
        guard light.getRed(&red, green: &green, blue: &blue, alpha: &alpha) else { return "#000000" }
        let rgb = [red, green, blue].map(byte).map { String(format: "%02x", $0) }.joined()
        let opacity = byte(alpha)
        return opacity == 255 ? "#\(rgb)" : "#\(rgb)\(String(format: "%02x", opacity))"
    }

    /// The colour a file names; anything that is not hex reads as black.
    static func color(_ hex: String) -> UIColor {
        let digits = hex.hasPrefix("#") ? hex.dropFirst() : Substring(hex)
        guard digits.count == 6 || digits.count == 8, let value = UInt64(digits, radix: 16) else {
            return .black
        }
        let rgba = digits.count == 8 ? value : value << 8 | 0xff
        func channel(_ shift: UInt64) -> CGFloat { CGFloat((rgba >> shift) & 0xff) / 255 }
        return UIColor(red: channel(24), green: channel(16), blue: channel(8), alpha: channel(0))
    }

    private static func byte(_ component: CGFloat) -> Int {
        Int((min(1, max(0, component)) * 255).rounded())
    }
}
