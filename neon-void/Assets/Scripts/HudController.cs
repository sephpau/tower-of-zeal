using UnityEngine;
using UnityEngine.UI;

// The entire HUD is built in code with uGUI: reticle, shield/hull bars,
// score, wave banner, hostile counter, damage vignette, start/game-over panels.
public class HudController : MonoBehaviour
{
    public bool WantsStart { get; private set; }
    public bool WantsRestart { get; private set; }

    Canvas _canvas;
    Font _font;
    Text _scoreText, _waveText, _hostilesText, _comboText, _bannerText, _throttleText;
    Image _shieldBar, _hullBar, _vignette, _reticle;
    GameObject _gameHud, _startPanel, _overPanel;
    Text _overScore, _overBest, _overStats;
    float _bannerTimer, _vignetteAlpha;
    WaveDirector _wavesRef;

    public void Build()
    {
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");

        var canvasGo = new GameObject("Canvas");
        canvasGo.transform.SetParent(transform, false);
        _canvas = canvasGo.AddComponent<Canvas>();
        _canvas.renderMode = RenderMode.ScreenSpaceOverlay;
        var scaler = canvasGo.AddComponent<CanvasScaler>();
        scaler.uiScaleMode = CanvasScaler.ScaleMode.ScaleWithScreenSize;
        scaler.referenceResolution = new Vector2(1920, 1080);
        canvasGo.AddComponent<GraphicRaycaster>();

        // damage vignette (borders glow red on hit)
        _vignette = NewImage(_canvas.transform, "vignette", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _vignette.sprite = Sprite.Create(NVAssets.RadialTex(new Color(0, 0, 0, 0), new Color(1f, 0.15f, 0.3f, 0.85f), 1.2f),
            new Rect(0, 0, 128, 128), new Vector2(0.5f, 0.5f));
        _vignette.color = new Color(1, 1, 1, 0);
        _vignette.raycastTarget = false;

        _gameHud = new GameObject("GameHud");
        _gameHud.transform.SetParent(_canvas.transform, false);
        Stretch(_gameHud.AddComponent<RectTransform>());

        // reticle follows the mouse
        _reticle = NewImage(_gameHud.transform, "reticle", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(46, 46));
        _reticle.sprite = RingSprite();
        _reticle.color = new Color(0.5f, 0.98f, 1f, 0.9f);
        _reticle.raycastTarget = false;

        _scoreText = NewText(_gameHud.transform, "score", "0", 44, TextAnchor.UpperLeft,
            new Vector2(0, 1), new Vector2(0, 1), new Vector2(30, -24), new Vector2(400, 60));
        _scoreText.color = new Color(0.5f, 0.98f, 1f);
        _scoreText.fontStyle = FontStyle.BoldAndItalic;

        _comboText = NewText(_gameHud.transform, "combo", "", 26, TextAnchor.UpperLeft,
            new Vector2(0, 1), new Vector2(0, 1), new Vector2(32, -78), new Vector2(400, 40));
        _comboText.color = new Color(1f, 0.85f, 0.4f);
        _comboText.fontStyle = FontStyle.BoldAndItalic;

        _waveText = NewText(_gameHud.transform, "wave", "WAVE 1", 30, TextAnchor.UpperRight,
            new Vector2(1, 1), new Vector2(1, 1), new Vector2(-30, -24), new Vector2(400, 44));
        _waveText.color = new Color(1f, 0.55f, 0.9f);
        _waveText.fontStyle = FontStyle.Bold;

        _hostilesText = NewText(_gameHud.transform, "hostiles", "", 22, TextAnchor.UpperRight,
            new Vector2(1, 1), new Vector2(1, 1), new Vector2(-30, -66), new Vector2(400, 34));
        _hostilesText.color = new Color(1f, 0.4f, 0.5f);

        _throttleText = NewText(_gameHud.transform, "throttle", "", 20, TextAnchor.LowerLeft,
            new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 22), new Vector2(400, 30));
        _throttleText.color = new Color(0.6f, 0.9f, 1f, 0.75f);

        // shield + hull bars bottom center
        _shieldBar = Bar(new Vector2(0, 46), new Color(0.35f, 0.8f, 1f));
        _hullBar = Bar(new Vector2(0, 28), new Color(1f, 0.5f, 0.35f));

        _bannerText = NewText(_gameHud.transform, "banner", "", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.65f), new Vector2(0.5f, 0.65f), Vector2.zero, new Vector2(1400, 90));
        _bannerText.color = new Color(1f, 0.4f, 0.85f, 0f);
        _bannerText.fontStyle = FontStyle.BoldAndItalic;

        BuildStartPanel();
        BuildOverPanel();
        _gameHud.SetActive(false);
    }

    // ---------- panels ----------
    void BuildStartPanel()
    {
        _startPanel = Panel("StartPanel");
        var t = NewText(_startPanel.transform, "title", "NEON VOID", 110, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.62f), new Vector2(0.5f, 0.62f), Vector2.zero, new Vector2(1600, 140));
        t.color = new Color(0.5f, 0.95f, 1f);
        t.fontStyle = FontStyle.BoldAndItalic;
        var s = NewText(_startPanel.transform, "sub", "FREE FLIGHT // SECTOR 7\n\nMOUSE steer · W/S throttle · SHIFT boost · Q/E roll\nCLICK / SPACE fire · M mute", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.42f), new Vector2(0.5f, 0.42f), Vector2.zero, new Vector2(1400, 220));
        s.color = new Color(0.8f, 0.9f, 1f, 0.85f);
        var p = NewText(_startPanel.transform, "pulse", "CLICK TO LAUNCH", 34, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.22f), new Vector2(0.5f, 0.22f), Vector2.zero, new Vector2(800, 60));
        p.color = new Color(1f, 0.85f, 0.4f);
        p.fontStyle = FontStyle.Bold;
        _startPanel.SetActive(false);
    }

    void BuildOverPanel()
    {
        _overPanel = Panel("OverPanel");
        var t = NewText(_overPanel.transform, "title", "SHIP DESTROYED", 84, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(1600, 110));
        t.color = new Color(1f, 0.35f, 0.5f);
        t.fontStyle = FontStyle.BoldAndItalic;
        _overScore = NewText(_overPanel.transform, "score", "0", 90, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1200, 120));
        _overScore.color = new Color(0.5f, 0.95f, 1f);
        _overScore.fontStyle = FontStyle.Bold;
        _overBest = NewText(_overPanel.transform, "best", "", 30, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.38f), new Vector2(0.5f, 0.38f), Vector2.zero, new Vector2(1200, 50));
        _overBest.color = new Color(1f, 0.85f, 0.4f);
        _overStats = NewText(_overPanel.transform, "stats", "", 24, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.31f), new Vector2(0.5f, 0.31f), Vector2.zero, new Vector2(1200, 40));
        _overStats.color = new Color(0.8f, 0.9f, 1f, 0.8f);
        var p = NewText(_overPanel.transform, "pulse", "CLICK TO RELAUNCH", 34, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.18f), new Vector2(0.5f, 0.18f), Vector2.zero, new Vector2(800, 60));
        p.color = new Color(1f, 0.85f, 0.4f);
        p.fontStyle = FontStyle.Bold;
        _overPanel.SetActive(false);
    }

    // ---------- public API ----------
    public void ShowStart() { _startPanel.SetActive(true); WantsStart = true; }
    public void ShowGameHud() { WantsStart = false; _startPanel.SetActive(false); _gameHud.SetActive(true); }

    public void ShowGameOver(int score, int best, bool newBest, int wave)
    {
        _gameHud.SetActive(false);
        _overPanel.SetActive(true);
        _overScore.text = score.ToString("N0");
        _overBest.text = newBest ? "NEW BEST!" : "BEST  " + best.ToString("N0");
        _overStats.text = "Reached wave " + wave;
        Invoke(nameof(EnableRestart), 1.2f);
    }
    void EnableRestart() { WantsRestart = true; }

    public void Tick(Health player, WaveDirector waves, int score)
    {
        _wavesRef = waves;
        _scoreText.text = score.ToString("N0");
        _waveText.text = "WAVE " + Mathf.Max(1, waves.wave);
        _hostilesText.text = waves.hostilesAlive > 0 ? waves.hostilesAlive + " HOSTILE" + (waves.hostilesAlive > 1 ? "S" : "") : "";
        _shieldBar.fillAmount = player.maxShield > 0 ? player.shield / player.maxShield : 0f;
        _hullBar.fillAmount = player.hull / player.maxHull;

        var ship = player.GetComponent<ShipController>();
        if (ship != null)
            _throttleText.text = "THR " + Mathf.RoundToInt(ship.throttle * 100) + "%" + (ship.boosting ? "  BOOST" : "");

        // reticle follows mouse
        _reticle.rectTransform.position = Input.mousePosition;

        // banner fade
        if (_bannerTimer > 0f)
        {
            _bannerTimer -= Time.deltaTime;
            float a = Mathf.Clamp01(_bannerTimer / 0.6f);
            float ain = Mathf.Clamp01((2.2f - _bannerTimer) / 0.25f);
            _bannerText.color = new Color(1f, 0.4f, 0.85f, Mathf.Min(a, ain));
        }

        // vignette decay
        _vignetteAlpha = Mathf.Max(0f, _vignetteAlpha - Time.deltaTime * 2.2f);
        _vignette.color = new Color(1, 1, 1, _vignetteAlpha);
    }

    public void SetCombo(int mult) { _comboText.text = mult >= 2 ? "COMBO x" + mult : ""; }
    public void WaveBanner(string msg) { _bannerText.text = msg; _bannerTimer = 2.2f; }
    public void FlashDamage() { _vignetteAlpha = 1f; }
    public void PulseShield() { }

    public void ScorePopup(int amount, Vector3 worldPos)
    {
        if (Camera.main == null) return;
        Vector3 sp = Camera.main.WorldToScreenPoint(worldPos);
        if (sp.z < 0) return;
        var t = NewText(_canvas.transform, "popup", "+" + amount, 26, TextAnchor.MiddleCenter,
            Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(200, 40));
        t.color = new Color(1f, 0.85f, 0.4f);
        t.fontStyle = FontStyle.Bold;
        t.rectTransform.position = sp;
        t.gameObject.AddComponent<ScorePopupAnim>();
    }

    // ---------- builders ----------
    GameObject Panel(string name)
    {
        var go = new GameObject(name);
        go.transform.SetParent(_canvas.transform, false);
        var rt = go.AddComponent<RectTransform>();
        Stretch(rt);
        var bg = go.AddComponent<Image>();
        bg.color = new Color(0.03f, 0.01f, 0.1f, 0.72f);
        bg.raycastTarget = false;
        return go;
    }

    Image Bar(Vector2 offset, Color color)
    {
        var bgi = NewImage(_gameHud.transform, "barbg", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), offset, new Vector2(360, 12));
        bgi.color = new Color(0.05f, 0.05f, 0.15f, 0.8f);
        var fill = NewImage(bgi.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        fill.color = color;
        fill.type = Image.Type.Filled;
        fill.fillMethod = Image.FillMethod.Horizontal;
        fill.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        return fill;
    }

    Image NewImage(Transform parent, string name, Vector2 anchorMin, Vector2 anchorMax, Vector2 anchoredPos, Vector2 size)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        var img = go.AddComponent<Image>();
        var rt = img.rectTransform;
        rt.anchorMin = anchorMin; rt.anchorMax = anchorMax;
        rt.anchoredPosition = anchoredPos;
        if (size != Vector2.zero) rt.sizeDelta = size;
        else { rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero; }
        img.raycastTarget = false;
        return img;
    }

    Text NewText(Transform parent, string name, string content, int fontSize, TextAnchor anchor,
        Vector2 anchorMin, Vector2 anchorMax, Vector2 anchoredPos, Vector2 size)
    {
        var go = new GameObject(name);
        go.transform.SetParent(parent, false);
        var t = go.AddComponent<Text>();
        t.font = _font;
        t.text = content;
        t.fontSize = fontSize;
        t.alignment = anchor;
        t.raycastTarget = false;
        var rt = t.rectTransform;
        rt.anchorMin = anchorMin; rt.anchorMax = anchorMax;
        rt.anchoredPosition = anchoredPos;
        rt.sizeDelta = size;
        var outline = go.AddComponent<Outline>();
        outline.effectColor = new Color(0f, 0f, 0.1f, 0.85f);
        outline.effectDistance = new Vector2(2, -2);
        return t;
    }

    void Stretch(RectTransform rt)
    {
        rt.anchorMin = Vector2.zero;
        rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero;
        rt.offsetMax = Vector2.zero;
    }

    Sprite RingSprite()
    {
        const int S = 64;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = Vector2.Distance(new Vector2(x, y), new Vector2(S / 2f, S / 2f)) / (S / 2f);
                float ring = Mathf.Clamp01(1f - Mathf.Abs(d - 0.8f) * 9f);
                float dot = Mathf.Clamp01(1f - d * 10f);
                tex.SetPixel(x, y, new Color(1, 1, 1, Mathf.Max(ring, dot)));
            }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }
}

public class ScorePopupAnim : MonoBehaviour
{
    float _life = 1f;
    void Update()
    {
        _life -= Time.deltaTime;
        if (_life <= 0f) { Destroy(gameObject); return; }
        transform.position += Vector3.up * 60f * Time.deltaTime;
        var t = GetComponent<UnityEngine.UI.Text>();
        var c = t.color; c.a = Mathf.Clamp01(_life / 0.5f); t.color = c;
    }
}
