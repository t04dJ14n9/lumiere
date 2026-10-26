import UIKit

/// The paper's lines or dots behind the canvas, where the sketch's SVG
/// draws them (packages/ink/src/format/paper.ts): every multiple of the
/// spacing from the sketch's origin. The board has no edge, so this view
/// only covers the screen and draws the part of the board that shows,
/// again whenever the canvas scrolls or zooms. The paper's colour is the
/// controller's background.
final class PaperView: UIView {
    static let lineColor = InkColor.color("#d5dce6")
    static let dotColor = InkColor.color("#bcc5d1")

    private let paper: StoredPaper
    private let origin: CGPoint
    /// The board's rectangle that shows, and the points per board point.
    private var visible = CGRect.zero
    private var zoom: CGFloat = 1

    init(paper: StoredPaper, origin: CGPoint) {
        self.paper = paper
        self.origin = origin
        super.init(frame: .zero)
        isUserInteractionEnabled = false
        isOpaque = false
        backgroundColor = .clear
        contentMode = .redraw
    }

    @available(*, unavailable)
    required init?(coder: NSCoder) { fatalError("init(coder:) is not used") }

    /// Whether this paper draws anything over its colour.
    static func hasMarks(_ paper: StoredPaper) -> Bool {
        ["ruled", "grid", "dotted"].contains(paper.style)
    }

    func show(visible: CGRect, zoom: CGFloat) {
        guard visible != self.visible || zoom != self.zoom else { return }
        self.visible = visible
        self.zoom = zoom
        setNeedsDisplay()
    }

    override func draw(_ rect: CGRect) {
        guard let context = UIGraphicsGetCurrentContext(), zoom > 0 else { return }
        context.scaleBy(x: zoom, y: zoom)
        context.translateBy(x: -visible.minX, y: -visible.minY)
        PaperMarks(paper: paper, origin: origin).draw(in: context, visible: visible)
    }
}

/// Where the paper's lines and dots go, in board points.
struct PaperMarks {
    let paper: StoredPaper
    /// The sketch's origin on the board: the marks are counted from it.
    let origin: CGPoint

    /// Every multiple of `spacing` from `start` in `range` (its end left out).
    static func offsets(spacing: Double, from start: Double, in range: Range<Double>) -> [Double] {
        guard spacing >= 1, !range.isEmpty else { return [] }
        let first = ((range.lowerBound - start) / spacing).rounded(.up)
        return Array(stride(from: start + first * spacing, to: range.upperBound, by: spacing))
    }

    func rows(in visible: CGRect) -> [Double] {
        Self.offsets(spacing: paper.spacing, from: origin.y, in: visible.minY..<visible.maxY)
    }

    func columns(in visible: CGRect) -> [Double] {
        Self.offsets(spacing: paper.spacing, from: origin.x, in: visible.minX..<visible.maxX)
    }

    func draw(in context: CGContext, visible: CGRect) {
        switch paper.style {
        case "ruled":
            stroke(across(visible), in: context)
        case "grid":
            stroke(across(visible) + down(visible), in: context)
        case "dotted":
            context.setFillColor(PaperView.dotColor.cgColor)
            for y in rows(in: visible) {
                for x in columns(in: visible) {
                    context.fillEllipse(in: CGRect(x: x - 1.25, y: y - 1.25, width: 2.5, height: 2.5))
                }
            }
        default:
            break
        }
    }

    /// Lines half a point off the grid, as the SVG draws them.
    private func across(_ visible: CGRect) -> [(CGPoint, CGPoint)] {
        rows(in: visible).map { (CGPoint(x: visible.minX, y: $0 + 0.5), CGPoint(x: visible.maxX, y: $0 + 0.5)) }
    }

    private func down(_ visible: CGRect) -> [(CGPoint, CGPoint)] {
        columns(in: visible).map { (CGPoint(x: $0 + 0.5, y: visible.minY), CGPoint(x: $0 + 0.5, y: visible.maxY)) }
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
