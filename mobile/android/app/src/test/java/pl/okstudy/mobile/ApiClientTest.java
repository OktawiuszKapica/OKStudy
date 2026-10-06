package pl.okstudy.mobile;

import static org.junit.Assert.*;

import java.nio.charset.StandardCharsets;
import java.util.concurrent.CancellationException;
import java.util.concurrent.atomic.AtomicInteger;
import org.json.*;
import org.junit.Test;

public class ApiClientTest {
  private static byte[] bytes(String s) {
    return s.getBytes(StandardCharsets.UTF_8);
  }

  private static JSONObject json(String s) throws Exception {
    return new JSONObject(s);
  }

  @Test
  public void onlyAnswerHandlesLettersTermsAndNumbers() {
    assertEquals("D", ApiClient.cleanAnswer("```json\n{\"answer\":\"D\"}\n```", true));
    assertEquals(
        "Dynamika Techniczna", ApiClient.cleanAnswer("{\"answer\":\"Dynamika Techniczna\"}", true));
    assertEquals("0", ApiClient.cleanAnswer("{\"answer\":0}", true));
    assertEquals("1. D\n2. A", ApiClient.cleanAnswer("{\"answer\":\"1. D\\n2. A\"}", true));
  }

  @Test
  public void stripsMarkupWithoutDestroyingMultiplication() {
    assertEquals("C — genetyka", ApiClient.cleanAnswer("**C** — __genetyka__", false));
    assertEquals("Wynik\n2 * 3 = 6", ApiClient.cleanAnswer("## Wynik\n`2 * 3 = 6`", false));
  }

  @Test
  public void providerPayloadsIncludeCorrectImageAndPrivacyFlag() throws Exception {
    JSONObject open = ApiClient.payload("openai", "future-9", "YWJj", true);
    assertFalse(open.getBoolean("store"));
    assertEquals(
        "data:image/jpeg;base64,YWJj",
        open.getJSONArray("input")
            .getJSONObject(0)
            .getJSONArray("content")
            .getJSONObject(1)
            .getString("image_url"));
    assertEquals(
        "YWJj",
        ApiClient.payload("gemini", "future", "YWJj", true)
            .getJSONArray("contents")
            .getJSONObject(0)
            .getJSONArray("parts")
            .getJSONObject(1)
            .getJSONObject("inline_data")
            .getString("data"));
    assertEquals(
        "image/jpeg",
        ApiClient.payload("claude", "future", "YWJj", false)
            .getJSONArray("messages")
            .getJSONObject(0)
            .getJSONArray("content")
            .getJSONObject(1)
            .getJSONObject("source")
            .getString("media_type"));
  }

  @Test
  public void acceptsNewModelNamesWithoutRelease() throws Exception {
    assertEquals(
        "astra-6.1",
        ApiClient.parseModels(
                "openai", json("{data:[{id:'astra-6.1'},{id:'text-embedding-3-small'}]}"))
            .get(0)
            .id());
    assertEquals(
        1,
        ApiClient.parseModels(
                "gemini",
                json(
                    "{models:[{name:'models/google-renamed',supportedGenerationMethods:['generateContent']},{name:'models/embedding',supportedGenerationMethods:['embedContent']}]}"))
            .size());
    assertEquals(
        "google-renamed",
        ApiClient.parseModels(
                "gemini",
                json(
                    "{models:[{name:'models/google-renamed',supportedGenerationMethods:['generateContent']}]}"))
            .get(0)
            .id());
  }

  @Test
  public void rejectsModelPathInjection() {
    assertFalse(ApiClient.validModel("test?key=secret"));
    assertFalse(ApiClient.validModel("test\nHeader:x"));
  }

  @Test
  public void catalogReadsAllPagesAndDeduplicates() throws Exception {
    AtomicInteger calls = new AtomicInteger();
    ApiClient client =
        new ApiClient(
            (url, method, headers, body, cancel) -> {
              assertEquals("GET", method);
              assertEquals("demo", headers.get("x-goog-api-key"));
              if (calls.getAndIncrement() == 0)
                return bytes(
                    "{models:[{name:'models/one',supportedGenerationMethods:['generateContent']}],nextPageToken:'a"
                        + " b'}");
              assertTrue(url.contains("pageToken=a+b"));
              return bytes(
                  "{models:[{name:'models/one',supportedGenerationMethods:['generateContent']},{name:'models/two',supportedGenerationMethods:['generateContent']}]}");
            });
    assertEquals(2, client.models("gemini", "demo", new ApiClient.Cancel()).size());
    assertEquals(2, calls.get());
  }

  @Test
  public void catalogRejectsRepeatedCursor() {
    ApiClient client =
        new ApiClient((u, m, h, b, c) -> bytes("{models:[],nextPageToken:'repeat'}"));
    assertThrows(Exception.class, () -> client.models("gemini", "demo", new ApiClient.Cancel()));
  }

  @Test
  public void neverDisplaysIncompleteAnswersOrReasoning() throws Exception {
    assertThrows(
        Exception.class,
        () ->
            ApiClient.extract(
                "openai",
                json(
                    "{status:'incomplete',output:[{type:'message',content:[{type:'output_text',text:'Wrong'}]}]}")));
    assertThrows(
        Exception.class,
        () -> ApiClient.extract("gemini", json("{candidates:[{finishReason:'MAX_TOKENS'}]}")));
    assertThrows(
        Exception.class,
        () -> ApiClient.extract("claude", json("{stop_reason:'max_tokens',content:[]}")));
    assertEquals(
        "D",
        ApiClient.extract(
            "gemini",
            json(
                "{candidates:[{finishReason:'STOP',content:{parts:[{text:'private"
                    + " reasoning',thought:true},{text:'D'}]}}]}")));
    assertEquals(
        "D",
        ApiClient.extract(
            "openai",
            json(
                "{status:'completed',output:[{type:'reasoning',summary:[]},{type:'message',content:[{type:'output_text',text:'D'}]}]}")));
  }

  @Test
  public void cancelledResponseCannotBeReturned() {
    ApiClient.Cancel token = new ApiClient.Cancel();
    ApiClient client =
        new ApiClient(
            (u, m, h, b, c) -> {
              c.cancel();
              return bytes(
                  "{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'D'}]}]}");
            });
    assertThrows(
        CancellationException.class,
        () -> client.analyze("openai", "demo", "future", "image", true, token));
  }

  @Test
  public void emptyNormalizedAnswerIsRejected() {
    ApiClient client =
        new ApiClient(
            (u, m, h, b, c) ->
                bytes(
                    "{status:'completed',output:[{type:'message',content:[{type:'output_text',text:'{\"answer\":\"\"}'}]}]}"));
    assertThrows(
        Exception.class,
        () -> client.analyze("openai", "demo", "future", "image", true, new ApiClient.Cancel()));
  }

  @Test
  public void providerKeysAreNotPlacedInUrls() throws Exception {
    for (String provider : ApiClient.PROVIDERS) {
      ApiClient client =
          new ApiClient(
              (u, m, h, b, c) -> {
                assertFalse(u.contains("secret"));
                assertTrue(h.containsValue("secret") || h.containsValue("Bearer secret"));
                throw new CancellationException();
              });
      assertThrows(
          CancellationException.class,
          () ->
              client.analyze(provider, "secret", "future", "image", true, new ApiClient.Cancel()));
    }
  }

  @Test
  public void speechUsesExplicitAudioEndpoint() throws Exception {
    ApiClient client =
        new ApiClient(
            (u, m, h, b, c) -> {
              assertEquals("https://api.openai.com/v1/audio/speech", u);
              assertEquals("marin", b.getString("voice"));
              assertEquals(4000, b.getString("input").length());
              return bytes("mp3");
            });
    assertArrayEquals(
        bytes("mp3"), client.speech("demo", "a".repeat(5000), new ApiClient.Cancel()));
  }
}
