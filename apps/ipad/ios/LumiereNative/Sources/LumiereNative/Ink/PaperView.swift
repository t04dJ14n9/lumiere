import UIKit

/// The page behind the canvas: its colour, then ruled lines, a grid or dots,
/// where the sketch's SVG draws them (packages/ink/src/format/paper.ts), so
/// the page looks the same while drawing and in the note. Drawn in tiles: a
/// page grown long would need a bitmap too large to keep whole.
final class PaperView: UIView {
    static let lineColor = InkColor.color("#d5dce6")
    static let dotColor = InkColor.color("#bcc5d1")

    override class var layerClass: AnyClass { InstantTiles.self }

    /// Set from the main thread; tiles are drawn on others.
    private let lock = NSLock()
    private var _paper: StoredPaper
    private var _scale: CGFloat = 1

    init(paper: StoredPaper) {
        _paper = paper
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isOpaque = false
        backgroundColor = .clear
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// Show the page `size` (in the sketch's points) at `scale` points per point.
    func show(size: CGSize, scale: CGFloat) {
        lock.withLock { _scale = scale }
        frame = CGRect(origin: .zero, size: CGSize(width: size.width * scale, height: size.height * scale))
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext() else { return }
        let (paper, scale) = lock.withLock { (_paper, _scale) }
        // A transparent page shows white here: the ink is drawn as on light paper.
        context.setFillColor((paper.color == "none" ? UIColor.white : InkColor.color(paper.color)).cgColor)
        context.fill(rect)
        let marks = PaperMarks(paper: paper, size: CGSize(width: bounds.width / scale, height: bounds.height / scale))
        context.scaleBy(x: scale, y: scale)
        marks.draw(in: context)
    }
}

/// Where the paper's lines and dots go, in the sketch's points.
struct PaperMarks {
    let paper: StoredPaper
    let size: CGSize

    /// Every multiple of the spacing strictly inside a side of `length`.
    static func offsets(spacing: Double, length: Double) -> [Double] {
        guard spacing >= 1 else { return [] }
        return Array(stride(from: spacing, to: length, by: spacing))
    }

    var rows: [Double] { Self.offsets(spacing: paper.spacing, length: size.height) }
    var columns: [Double] { Self.offsets(spacing: paper.spacing, length: size.width) }

    func draw(in context: CGContext) {
        switch paper.style {
        case "ruled":
            stroke(lines(across: true), in: context)
        case "grid":
            stroke(lines(across: true) + lines(across: false), in: context)
        case "dotted":
            context.setFillColor(PaperView.dotColor.cgColor)
            for y in rows {
                for x in columns {
                    context.fillEllipse(in: CGRect(x: x - 1.25, y: y - 1.25, width: 2.5, height: 2.5))
                }
            }
        default:
            break
        }
    }

    /// Lines half a point off the grid, as the SVG draws them.
    private func lines(across: Bool) -> [(CGPoint, CGPoint)] {
        if across {
            return rows.map { (CGPoint(x: 0, y: $0 + 0.5), CGPoint(x: size.width, y: $0 + 0.5)) }
        }
        return columns.map { (CGPoint(x: $0 + 0.5, y: 0), CGPoint(x: $0 + 0.5, y: size.height)) }
    }

    private func stroke(_ lines: [(CGPoint, CGPoint)], in context: CGContext) {
        context.setStrokeColor(PaperView.lineColor.cgColor)
        context.setLineWidth(1)
        for (from, to) in lines {
            context.move(to: from)
            context.addLine(to: to)
        }
        context.strokePath()
    }
}

/// Tiles that show at once instead of fading in.
final class InstantTiles: CATiledLayer {
    override class func fadeDuration() -> CFTimeInterval { 0 }
}
