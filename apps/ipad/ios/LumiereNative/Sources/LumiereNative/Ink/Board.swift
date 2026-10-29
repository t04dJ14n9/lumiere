import CoreGraphics

/// The canvas's drawing area, as Freeform's: far larger than any sketch, so
/// the reader never meets an edge. The sketch sits in its middle while it is
/// drawn, and is cut back to what was drawn when it is saved.
struct Board {
    /// The least side of the board, in the sketch's points.
    static let minimumSide: CGFloat = 16384
    /// Room kept around the strokes when the sketch is cut to them.
    static let margin: CGFloat = 16

    let side: CGFloat
    /// Where the sketch's own (0, 0) is on the board: a multiple of the
    /// paper's spacing, so its lines fall where the saved SVG draws them.
    let origin: CGPoint
    let spacing: CGFloat

    init(sketch size: CGSize, spacing: CGFloat) {
        let step = max(1, spacing)
        let side = max(Self.minimumSide, (max(size.width, size.height) * 2).rounded(.up))
        let centred = { (length: CGFloat) in ((side - length) / 2 / step).rounded(.down) * step }
        self.spacing = step
        self.side = side
        origin = CGPoint(x: centred(size.width), y: centred(size.height))
    }

    /// Where a point of the sketch is on the board, and back.
    var placing: CGAffineTransform { CGAffineTransform(translationX: origin.x, y: origin.y) }

    /// The part of the board a sketch keeps: the strokes' bounds with a
    /// margin, widened to whole steps of the paper's spacing counted from the
    /// sketch's origin. Nil when nothing is drawn.
    func frame(holding bounds: CGRect) -> CGRect? {
        // An empty PKDrawing's bounds are null.
        guard !bounds.isNull else { return nil }
        let wide = bounds.insetBy(dx: -Self.margin, dy: -Self.margin)
        func down(_ value: CGFloat, _ from: CGFloat) -> CGFloat {
            from + ((value - from) / spacing).rounded(.down) * spacing
        }
        func up(_ value: CGFloat, _ from: CGFloat) -> CGFloat {
            from + ((value - from) / spacing).rounded(.up) * spacing
        }
        let minX = down(wide.minX, origin.x)
        let minY = down(wide.minY, origin.y)
        return CGRect(
            x: minX, y: minY, width: up(wide.maxX, origin.x) - minX, height: up(wide.maxY, origin.y) - minY)
    }
}
