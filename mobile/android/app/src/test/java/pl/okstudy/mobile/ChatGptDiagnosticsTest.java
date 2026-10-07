package pl.okstudy.mobile;

import static org.junit.Assert.*;

import org.json.*;
import org.junit.Test;

/** Diagnostic output contains catalog/transport metadata, never private payload fields. */
public class ChatGptDiagnosticsTest {
  @Test
  public void distinguishesMissingAndFilteredModelsWithoutInventingAvailability() throws Exception {
    JSONObject catalog =
        new JSONObject(
            """
            {"email":"private-email","access_token":"private-token","models":[
              {"slug":"gpt-6.1-sol","visibility":"list","display_name":"private-name"},
              {"slug":"gpt-6-sol","visibility":"hide"},
              {"slug":"gpt-5.6-sol","visibility":"list"},
              {"slug":"invalid model"},null]}
            """);
    String report = ChatGptDiagnostics.catalogSummary(catalog);
    assertTrue(report.contains("Pokazane: 2"));
    assertTrue(report.contains("Nieprawidłowe wpisy: 2"));
    assertTrue(report.contains("gpt-6.1-sol: visibility=list · pokazany"));
    assertTrue(report.contains("gpt-6-sol: visibility=hide · pominięty przez filtr"));
    assertTrue(report.contains("gpt-6-luna: niezwrócony"));
    assertFalse(report.contains("private-"));
  }

  @Test
  public void reportsDifferentCatalogShape() throws Exception {
    String report =
        ChatGptDiagnostics.catalogSummary(new JSONObject("{\"data\":[],\"has_more\":true}"));
    assertTrue(report.contains("Tablica models: brak"));
    assertTrue(report.contains("Tablica data: 0"));
    assertTrue(report.contains("has_more: true"));
  }

  @Test
  public void transportSummaryDoesNotExposeBodiesOrArbitraryHeaderValues() {
    PlanHttp.Reply reply =
        new PlanHttp.Reply(
            "private-body", 200, "private-request-id", "private-content-type", "private-age");
    String report = reply.describe();
    assertTrue(report.contains("HTTP: 200"));
    assertFalse(report.contains("private-"));
  }

  @Test
  public void reportIsScopedToSelectedAccountAndGeneration() {
    ChatGptDiagnostics.catalog("account-fixture", 71, "catalog-fixture");
    ChatGptDiagnostics.response("account-fixture", 71, "response-fixture");
    String report = ChatGptDiagnostics.report("account-fixture", 71);
    assertTrue(report.contains("catalog-fixture"));
    assertTrue(report.contains("response-fixture"));
    assertFalse(report.contains("account-fixture"));
    assertFalse(ChatGptDiagnostics.report("other-account", 71).contains("catalog-fixture"));
    assertFalse(ChatGptDiagnostics.report("account-fixture", 72).contains("response-fixture"));
  }
}
