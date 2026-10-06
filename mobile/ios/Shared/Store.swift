import Foundation
import Security

struct StudyError: LocalizedError {
    let message: String
    init(_ message: String) { self.message = message }
    var errorDescription: String? { message }
}

enum Store {
    static var defaults: UserDefaults {
        // Read-only defaults allow the first screen to render before signing setup;
        // saving checks the entitlement and reports a missing App Group.
        guard let group = Bundle.main.object(forInfoDictionaryKey: "OKStudyAppGroup") as? String,
              FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil,
              let defaults = UserDefaults(suiteName: group) else { return .standard }
        return defaults
    }
    static var provider: String { defaults.string(forKey: "provider") ?? "gemini" }
    static func model(_ provider: String) -> String { defaults.string(forKey: "model." + provider) ?? "" }
    static var only: Bool { defaults.object(forKey: "answerOnly") as? Bool ?? true }
    static func query(_ provider: String) throws -> [String: Any] {
        guard let group = Bundle.main.object(forInfoDictionaryKey: "OKStudyKeychainGroup") as? String,
              !group.contains("$(") else { throw StudyError("Nie skonfigurowano wspólnego pęku kluczy aplikacji i rozszerzenia.") }
        return [kSecClass as String: kSecClassGenericPassword, kSecAttrService as String: "OKStudy.API",
                kSecAttrAccount as String: provider, kSecAttrAccessGroup as String: group]
    }
    static func key(_ provider: String) throws -> String {
        var request = try query(provider)
        request[kSecReturnData as String] = true
        request[kSecMatchLimit as String] = kSecMatchLimitOne
        var result: CFTypeRef?
        let status = SecItemCopyMatching(request as CFDictionary, &result)
        if status == errSecItemNotFound { return "" }
        guard status == errSecSuccess, let data = result as? Data, let key = String(data: data, encoding: .utf8) else {
            throw StudyError("Nie udało się odczytać klucza. Sprawdź Keychain Sharing i odblokuj urządzenie.")
        }
        return key
    }
    static func saveKey(_ value: String, provider: String) throws {
        let query = try query(provider)
        if value.isEmpty {
            let status = SecItemDelete(query as CFDictionary)
            guard status == errSecSuccess || status == errSecItemNotFound else { throw StudyError("Nie udało się usunąć klucza.") }
            return
        }
        let attributes: [String: Any] = [kSecValueData as String: Data(value.utf8),
            kSecAttrAccessible as String: kSecAttrAccessibleWhenUnlockedThisDeviceOnly]
        var status = SecItemUpdate(query as CFDictionary, attributes as CFDictionary)
        if status == errSecItemNotFound { status = SecItemAdd(query.merging(attributes) { _, new in new } as CFDictionary, nil) }
        guard status == errSecSuccess else { throw StudyError("Nie udało się zapisać klucza w pęku kluczy.") }
    }
    static func save(provider: String, model: String, key: String, only: Bool) throws {
        guard API.validModel(model) else { throw StudyError("Wybierz model lub wpisz jego identyfikator.") }
        if !key.isEmpty { try saveKey(key, provider: provider) }
        guard !(try self.key(provider)).isEmpty else { throw StudyError("Najpierw zapisz klucz API.") }
        guard let group = Bundle.main.object(forInfoDictionaryKey: "OKStudyAppGroup") as? String,
              FileManager.default.containerURL(forSecurityApplicationGroupIdentifier: group) != nil else {
            throw StudyError("Włącz wspólną App Group w obu targetach projektu Xcode.")
        }
        defaults.set(provider, forKey: "provider"); defaults.set(model, forKey: "model." + provider)
        defaults.set(only, forKey: "answerOnly")
    }
}
