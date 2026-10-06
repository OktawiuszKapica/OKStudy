import XCTest
@testable import OKStudy

final class APITests: XCTestCase {
    func testPlainAnswers() {
        XCTAssertEqual(API.clean("```json\n{\"answer\":\"D\"}\n```", only: true), "D")
        XCTAssertEqual(API.clean("{\"answer\":\"Dynamika Techniczna\"}", only: true), "Dynamika Techniczna")
        XCTAssertEqual(API.clean("**C** — `2 * 3`", only: false), "C — 2 * 3")
    }
    func testModelNamesAndInjection() {
        XCTAssertTrue(API.validModel("astra-6.1"))
        XCTAssertTrue(API.validModel("new-google-model"))
        XCTAssertFalse(API.validModel("model?key=secret"))
        XCTAssertFalse(API.validModel("model\nheader:value"))
        XCTAssertFalse(API.validModel("model\n"))
    }
    func testIncompleteResponsesAreRejected() {
        XCTAssertThrowsError(try API.extract(["status": "incomplete", "output": []], provider: "openai"))
        XCTAssertThrowsError(try API.extract(["stop_reason": "max_tokens", "content": []], provider: "claude"))
        XCTAssertThrowsError(try API.extract(["candidates": [["finishReason": "MAX_TOKENS"]]], provider: "gemini"))
    }
    func testReasoningIsNotDisplayed() throws {
        let json: [String: Any] = ["candidates": [["finishReason": "STOP", "content": ["parts": [["text": "private reasoning", "thought": true], ["text": "D"]]]]]]
        XCTAssertEqual(try API.extract(json, provider: "gemini"), "D")
    }
}
