import AppKit

enum FloatingBarLogo {
  static let image: NSImage? = {
    guard let url = logoURL(), let image = NSImage(contentsOf: url) else {
      return nil
    }
    image.isTemplate = true
    return image
  }()

  private static func logoURL() -> URL? {
    let fileManager = FileManager.default
    let resourceName = "mentari-logo"

    let candidates = [
      Bundle.main.url(forResource: resourceName, withExtension: "png"),
      Bundle.main.resourceURL?.appendingPathComponent("\(resourceName).png"),
      Bundle.main.resourceURL?.appendingPathComponent(
        "windows-swift_swift-lib.bundle/\(resourceName).png"),
      URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent()
        .appendingPathComponent("Resources/\(resourceName).png"),
    ]

    return candidates.compactMap { $0 }.first {
      fileManager.fileExists(atPath: $0.path)
    }
  }
}
