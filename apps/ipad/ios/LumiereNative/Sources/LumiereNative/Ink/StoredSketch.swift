import Foundation

/// A sketch as its file's metadata stores it (packages/ink/src/format,
/// `encodeSketch`). The TypeScript side hands the canvas this JSON and takes
/// the same JSON back, so the bridge and the file share one format. Each
/// stroke's points are one flat list, in the order `fields` names.
struct StoredSketch: Codable, Equatable {
    var format = "lumiere-sketch"
    var version = 1
    var width: Double
    var height: Double
    var paper: StoredPaper
    var fields: [String]
    var strokes: [StoredStroke]
    /// PencilKit's own data, base64, with the fingerprint of the strokes it
    /// was saved with. TypeScript drops it when the strokes changed since.
    var pencilKit: StoredPencilKit?
}

struct StoredPaper: Codable, Equatable {
    /// `plain`, `ruled`, `grid` or `dotted`; anything else draws plain.
    var style: String
    var spacing: Double
    /// `#rrggbb`, or `none` for a transparent page.
    var color: String
}

struct StoredStroke: Codable, Equatable {
    /// One of PencilKit's inks, as `InkConversion.inks` names them.
    var tool: String
    /// `#rrggbb` or `#rrggbbaa`, as drawn on light paper.
    var color: String
    var points: [Double]
}

struct StoredPencilKit: Codable, Equatable {
    var data: String
    var strokes: String
}

/// One point of a stroke, as the file keeps it: PencilKit's `PKStrokePoint`
/// in the sketch's coordinates, with force from 0 to 1.
struct PortablePoint: Equatable {
    var x: Double
    var y: Double
    /// Seconds since the stroke began.
    var t: Double
    var force: Double
    var altitude: Double
    var azimuth: Double
    var width: Double
    var opacity: Double

    /// The fields this version writes, in order (encoding.ts, `POINT_FIELDS`).
    static let fields = ["x", "y", "t", "force", "altitude", "azimuth", "width", "opacity"]

    var values: [Double] { [x, y, t, force, altitude, azimuth, width, opacity] }
}

/// Where each field sits in a stored point, found by name as TypeScript
/// finds them, so a file with more fields, or fewer optional ones, reads.
struct PointColumns {
    private let column: [String: Int]
    /// How many numbers one stored point takes.
    let stride: Int

    init(_ fields: [String]) {
        var column: [String: Int] = [:]
        for (index, name) in fields.enumerated() where column[name] == nil {
            column[name] = index
        }
        self.column = column
        stride = fields.count
    }

    /// Whether the fields a point cannot do without are there.
    var isComplete: Bool { ["x", "y", "width"].allSatisfy { column[$0] != nil } }

    /// The stroke's points; a damaged list (not whole points) reads as none.
    func points(_ values: [Double]) -> [PortablePoint] {
        guard isComplete, stride > 0, values.count % stride == 0 else { return [] }
        return Swift.stride(from: 0, to: values.count, by: stride).map { start in
            func field(_ name: String, _ fallback: Double) -> Double {
                guard let at = column[name] else { return fallback }
                let value = values[start + at]
                return value.isFinite ? value : fallback
            }
            return PortablePoint(
                x: field("x", 0), y: field("y", 0), t: field("t", 0),
                force: field("force", 0.5), altitude: field("altitude", .pi / 2),
                azimuth: field("azimuth", 0), width: field("width", 1), opacity: field("opacity", 1)
            )
        }
    }
}
