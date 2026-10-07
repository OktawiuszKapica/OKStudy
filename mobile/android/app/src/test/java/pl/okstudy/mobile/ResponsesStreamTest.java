package pl.okstudy.mobile;

import static org.junit.Assert.*;

import org.json.*;
import org.junit.Test;

/** Synthetic protocol fixtures; no device, account, image or network. */
public class ResponsesStreamTest {
  private static String event(String type, String fields) throws Exception {
    JSONObject data = new JSONObject(fields).put("type", type);
    return "event: " + type + "\r\ndata: " + data + "\r\n\r\n";
  }

  private static String delta(String text) throws Exception {
    return event(
        "response.output_text.delta",
        new JSONObject()
            .put("output_index", 0)
            .put("content_index", 0)
            .put("item_id", "msg_fixture")
            .put("delta", text)
            .toString());
  }

  private static String completed(String output) throws Exception {
    return event(
        "response.completed",
        "{\"response\":{\"status\":\"completed\"," + "\"error\":null,\"output\":" + output + "}}");
  }

  @Test
  public void collectsDeltasWhenCompletedDoesNotRepeatText() throws Exception {
    String stream = delta("Dynamika ") + delta("Techniczna") + completed("[]");
    assertEquals("Dynamika Techniczna", new ResponsesStream().read(stream, true));
  }

  @Test
  public void reconcilesDoneAndSnapshotsWithoutRepeatingAnswer() throws Exception {
    String stream =
        delta("D")
            + event(
                "response.output_text.done",
                "{\"output_index\":0,\"content_index\":0,\"text\":\"D\"}")
            + event(
                "response.content_part.done",
                "{\"output_index\":0,\"content_index\":0,"
                    + "\"part\":{\"type\":\"output_text\",\"text\":\"D\"}}")
            + event(
                "response.output_item.done",
                "{\"output_index\":0,\"item\":{\"id\":\"msg_fixture\","
                    + "\"type\":\"message\",\"role\":\"assistant\",\"status\":\"completed\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"D\"}]}}")
            + completed(
                "[{\"id\":\"msg_fixture\",\"type\":\"message\",\"role\":\"assistant\","
                    + "\"content\":[{\"type\":\"output_text\",\"text\":\"D\"}]}]");
    assertEquals("D", new ResponsesStream().read(stream, true));
  }

  @Test
  public void emptyTerminalSnapshotKeepsPreviouslyReceivedText() throws Exception {
    String stream =
        delta("D")
            + completed(
                "[{\"id\":\"msg_fixture\",\"type\":\"message\","
                    + "\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"\"}]}]");
    assertEquals("D", new ResponsesStream().read(stream, true));
  }

  @Test
  public void acceptsTextFromItemDoneWithoutDeltas() throws Exception {
    String stream =
        event(
                "response.output_item.done",
                "{\"output_index\":0,\"item\":{"
                    + "\"type\":\"message\",\"role\":\"assistant\",\"content\":[{\"type\":\"output_text\",\"text\":\"D\"}]}}")
            + completed("[]");
    assertEquals("D", new ResponsesStream().read(stream, true));
  }

  @Test
  public void reasoningToolsAndAnalysisAreNotAnswerText() throws Exception {
    String stream =
        completed(
            """
            [{"type":"reasoning","summary":[{"type":"summary_text","text":"private-reasoning"}]},
             {"type":"function_call","arguments":"private-arguments"},
             {"type":"message","role":"assistant","channel":"analysis",
              "content":[{"type":"output_text","text":"private-analysis"}]},
             {"type":"message","role":"assistant","channel":"final",
              "content":[{"type":"output_text","text":"D"}]}]
            """);
    ResponsesStream reader = new ResponsesStream();
    assertEquals("D", reader.read(stream, true));
    assertFalse(reader.describe().contains("private-"));
    assertTrue(reader.describe().contains("Elementy reasoning: 1"));
  }

  @Test
  public void refusesPartialAnswerAndLateFailureEvenAfterCompleted() throws Exception {
    assertThrows(Exception.class, () -> new ResponsesStream().read(delta("D"), true));
    assertThrows(
        Exception.class, () -> new ResponsesStream().read(delta("D") + "data: [DONE]\n\n", true));
    String lateFailure =
        delta("D")
            + completed("[]")
            + event(
                "response.failed",
                "{\"response\":{\"error\":{\"code\":\"subscription_sharing_usage_limit_exceeded\"}}}");
    Exception failure =
        assertThrows(Exception.class, () -> new ResponsesStream().read(lateFailure, true));
    assertTrue(failure.getMessage().contains("Zarządzaj użyciem"));
  }

  @Test
  public void rejectsRefusalAndConflictingItemIds() throws Exception {
    String refused =
        delta("D")
            + event("response.refusal.done", "{\"refusal\":\"private-refusal\"}")
            + completed("[]");
    assertThrows(Exception.class, () -> new ResponsesStream().read(refused, true));
    String conflict =
        delta("D") + completed("[{\"id\":\"msg_other\",\"type\":\"message\",\"content\":[]}]");
    assertThrows(Exception.class, () -> new ResponsesStream().read(conflict, true));
  }

  @Test
  public void supportsSseFramingAndEventNameFallback() throws Exception {
    String stream =
        "\uFEFF: keepalive\r\n\r\nevent: response.output_text.delta\r\ndata: {\r\n"
            + "data: \"delta\":\"D\"}\r\n\r\n"
            + completed("[]");
    assertEquals("D", new ResponsesStream().read(stream, true));
  }

  @Test
  public void malformedTextNeverBecomesAnswer() throws Exception {
    String stream =
        event("response.output_text.delta", "{\"delta\":{\"unexpected\":\"value\"}}")
            + completed("[]");
    assertThrows(Exception.class, () -> new ResponsesStream().read(stream, true));
  }

  @Test
  public void emptyCompletedResponseHasUsefulSafeDiagnostics() throws Exception {
    ResponsesStream reader = new ResponsesStream();
    Exception failure = assertThrows(Exception.class, () -> reader.read(completed("[]"), true));
    assertTrue(failure.getMessage().contains("Diagnostykę ChatGPT"));
    assertTrue(reader.describe().contains("response.completed: true"));
    assertTrue(reader.describe().contains("Znaki tekstu: 0"));
  }
}
