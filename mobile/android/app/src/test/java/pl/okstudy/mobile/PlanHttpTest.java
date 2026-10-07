package pl.okstudy.mobile;

import static org.junit.Assert.*;

import org.json.*;
import org.junit.Test;

/** Protocol regression fixtures. No device, credentials or network are used. */
public class PlanHttpTest {
  private static JSONObject completedResponse() throws Exception {
    return new JSONObject(
        """
        {"status":"completed","error":null,"incomplete_details":null,
         "output":[{"type":"message","status":"completed","role":"assistant",
          "content":[{"type":"output_text","text":"D"}]}]}
        """);
  }

  private static String event(String type, JSONObject response) throws Exception {
    return "event: "
        + type
        + "\r\ndata: "
        + new JSONObject().put("type", type).put("response", response)
        + "\r\n\r\n";
  }

  @Test
  public void acceptsDocumentedNullErrorInJsonAndCompletedStream() throws Exception {
    JSONObject response = completedResponse();
    assertEquals("D", ApiClient.extract("openai", response));
    assertEquals("D", PlanHttp.completed(event("response.completed", response), true));
    response.remove("error");
    assertEquals("D", ApiClient.extract("openai", response));
  }

  @Test
  public void stillRejectsRealErrorsAndIncompleteResponses() throws Exception {
    JSONObject response = completedResponse();
    response.put("error", new JSONObject().put("code", "server_error"));
    assertThrows(Exception.class, () -> ApiClient.extract("openai", response));
    assertThrows(
        Exception.class, () -> PlanHttp.completed(event("response.completed", response), true));
    response.put("error", JSONObject.NULL).put("status", "incomplete");
    response.put("incomplete_details", new JSONObject().put("reason", "max_output_tokens"));
    assertThrows(Exception.class, () -> ApiClient.extract("openai", response));
    Exception failure =
        assertThrows(
            Exception.class,
            () -> PlanHttp.completed(event("response.incomplete", response), true));
    assertTrue(failure.getMessage().contains("max_output_tokens"));
  }

  @Test
  public void partialTextAndLateFailureNeverCountAsSuccess() throws Exception {
    String partial = "data: {\"type\":\"response.output_text.delta\",\"delta\":\"D\"}\n\n";
    assertThrows(Exception.class, () -> PlanHttp.completed(partial, true));
    JSONObject failed =
        new JSONObject()
            .put(
                "error", new JSONObject().put("code", "subscription_sharing_usage_limit_exceeded"));
    String stream = partial + event("response.failed", failed);
    Exception failure = assertThrows(Exception.class, () -> PlanHttp.completed(stream, true));
    assertTrue(failure.getMessage().contains("Zarządzaj użyciem"));
  }

  @Test
  public void errorCodesAreParsedWithoutExposingRawMessages() {
    String body =
        """
        {"error":{"code":"subscription_sharing_unsupported_capability","param":"model",
        "message":"sensitive-example-must-not-appear"}}
        """;
    String message = PlanHttp.failure(body, 400).getMessage();
    assertTrue(message.contains("HTTP 400"));
    assertTrue(message.contains("subscription_sharing_unsupported_capability"));
    assertTrue(message.contains("pole: model"));
    assertFalse(message.contains("sensitive-example"));
    String misleading =
        """
        {"error":{"code":"model_not_found","message":"subscription_sharing_usage_limit_exceeded"}}
        """;
    assertTrue(PlanHttp.failure(misleading, 404).getMessage().contains("model_not_found"));
    assertFalse(PlanHttp.failure(misleading, 404).getMessage().contains("limit planu"));
  }

  @Test
  public void temporaryPlanAvailabilityDoesNotAskForNewSignIn() {
    String body = "{\"error\":{\"code\":\"subscription_sharing_usage_unavailable\"}}";
    String message = PlanHttp.failure(body, 503).getMessage();
    assertTrue(message.contains("Spróbuj później"));
    assertFalse(message.contains("Zaloguj"));
  }
}
