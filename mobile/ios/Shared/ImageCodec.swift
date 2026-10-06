import UIKit
import ImageIO
import UniformTypeIdentifiers

enum ImageCodec {
    static func jpeg(_ data: Data) throws -> Data {
        guard let source = CGImageSourceCreateWithData(data as CFData, nil) else { throw StudyError("Nie można odczytać obrazu.") }
        return try encode(source)
    }
    static func jpeg(url: URL) throws -> Data {
        guard url.isFileURL, let source = CGImageSourceCreateWithURL(url as CFURL, nil) else { throw StudyError("Nie można odczytać udostępnionego obrazu.") }
        return try encode(source)
    }
    private static func encode(_ source: CGImageSource) throws -> Data {
        let options: [CFString: Any] = [kCGImageSourceCreateThumbnailFromImageAlways: true,
            kCGImageSourceCreateThumbnailWithTransform: true, kCGImageSourceThumbnailMaxPixelSize: 2000,
            kCGImageSourceShouldCacheImmediately: true]
        guard let image = CGImageSourceCreateThumbnailAtIndex(source, 0, options as CFDictionary),
              let jpeg = UIImage(cgImage: image).jpegData(compressionQuality: 0.88) else { throw StudyError("Nie można przygotować zrzutu.") }
        return jpeg
    }
}
