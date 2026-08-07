using System.Collections.Generic;
using UnityEngine;
using UnityEngine.EventSystems;
using UnityEngine.UI;

// The entire HUD is built in code with uGUI: reticle, shield/hull bars,
// score, wave banner, hostile counter, damage vignette, start/game-over panels.
public class HudController : MonoBehaviour
{
    public bool WantsStart { get; private set; }
    public bool WantsRestart { get; private set; }

    Canvas _canvas;
    Font _font;
    Text _scoreText, _waveText, _hostilesText, _comboText, _bannerText, _throttleText, _weaponText, _bossName;
    Image _shieldBar, _hullBar, _vignette, _reticle, _bossBar, _warnBorder;
    GameObject _settingsPanel;
    GameObject _gameHud, _startPanel, _overPanel, _winPanel, _bossGroup;
    Text _overScore, _overBest, _overStats, _winScore, _winBest;
    float _bannerTimer, _vignetteAlpha;
    WaveDirector _wavesRef;

    Text _xpLevelText, _timerText, _skillCdText, _skillLabel;
    Image _xpBar, _skillFill, _skillIconImg;
    string _skillIconFor;
    readonly List<Image> _dirPool = new List<Image>();
    readonly List<Image> _actFills = new List<Image>();
    readonly List<Image> _actIcons = new List<Image>();
    readonly List<Text> _actAbbrevs = new List<Text>();
    Sprite _arrowSprite;
    GameObject _levelUpPanel, _tourneySetupPanel, _tourneyResultsPanel;
    InputField _codeInput, _nameInput;
    Text _tourneyPilotPreview, _resultsTitle, _resultsScore, _resultsVerify, _resultsStandings;
    readonly List<GameObject> _levelUpCards = new List<GameObject>();

    Font _titleFont;

    public void Build()
    {
        _font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
        _titleFont = Resources.Load<Font>("LuckiestGuy-Regular");   // Zeal Survivors v1 heading font
        if (_titleFont == null) _titleFont = _font;

        if (FindAnyObjectByType<EventSystem>() == null)
        {
            var es = new GameObject("EventSystem");
            es.AddComponent<EventSystem>();
            es.AddComponent<StandaloneInputModule>();
        }

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

        // incoming-fire warning: full-screen red border flash (toggle in settings)
        _warnBorder = NewImage(_canvas.transform, "warnBorder", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _warnBorder.sprite = _vignette.sprite;
        _warnBorder.color = new Color(1, 1, 1, 0);
        _warnBorder.raycastTarget = false;

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

        _weaponText = NewText(_gameHud.transform, "weapon", "PULSER LV 1", 20, TextAnchor.LowerLeft,
            new Vector2(0, 0), new Vector2(0, 0), new Vector2(30, 52), new Vector2(500, 160));
        _weaponText.color = new Color(0.5f, 1f, 0.6f, 0.9f);
        _weaponText.fontStyle = FontStyle.Bold;

        // boss health bar (hidden until the dreadnought shows up)
        _bossGroup = new GameObject("BossGroup");
        _bossGroup.transform.SetParent(_gameHud.transform, false);
        var bgRt = _bossGroup.AddComponent<RectTransform>();
        bgRt.anchorMin = new Vector2(0.5f, 1f); bgRt.anchorMax = new Vector2(0.5f, 1f);
        bgRt.anchoredPosition = new Vector2(0, -110);
        bgRt.sizeDelta = new Vector2(700, 50);
        _bossName = NewText(_bossGroup.transform, "bossname", "VOID DREADNOUGHT", 24, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -8), new Vector2(700, 30));
        _bossName.color = new Color(1f, 0.25f, 0.35f);
        _bossName.fontStyle = FontStyle.BoldAndItalic;
        _bossName.font = _titleFont;
        var bossBg = NewImage(_bossGroup.transform, "bossbarbg", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 8), new Vector2(640, 12));
        bossBg.color = new Color(0.05f, 0.05f, 0.15f, 0.8f);
        _bossBar = NewImage(bossBg.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _bossBar.color = new Color(1f, 0.25f, 0.35f);
        _bossBar.type = Image.Type.Filled;
        _bossBar.fillMethod = Image.FillMethod.Horizontal;
        _bossBar.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        _bossGroup.SetActive(false);

        // shield + hull bars bottom center
        _shieldBar = Bar(new Vector2(0, 46), new Color(0.35f, 0.8f, 1f));
        _hullBar = Bar(new Vector2(0, 28), new Color(1f, 0.5f, 0.35f));

        // special-skill cooldown gauge beside the bars
        var skillBg = NewImage(_gameHud.transform, "skillbg", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(190, 112), new Vector2(84, 84));
        skillBg.sprite = CircleSprite();
        skillBg.color = new Color(0.05f, 0.05f, 0.15f, 0.85f);
        _skillIconImg = NewImage(skillBg.transform, "icon", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(56, 56));
        _skillIconImg.color = new Color(1f, 0.97f, 0.9f, 0.95f);
        _skillFill = NewImage(skillBg.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _skillFill.sprite = CircleSprite();
        _skillFill.type = Image.Type.Filled;
        _skillFill.fillMethod = Image.FillMethod.Radial360;
        _skillFill.fillOrigin = (int)Image.Origin360.Top;
        _skillFill.fillClockwise = true;
        _skillCdText = NewText(skillBg.transform, "cd", "", 28, TextAnchor.MiddleCenter,
            Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _skillCdText.fontStyle = FontStyle.Bold;
        _skillLabel = NewText(skillBg.transform, "label", "RMB", 14, TextAnchor.UpperCenter,
            new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, -4), new Vector2(80, 20));
        _skillLabel.color = new Color(1f, 0.85f, 0.4f, 0.85f);

        // active skill slots 1-4, mirrored on the left of the bars
        for (int i = 0; i < 4; i++)
        {
            var slotBg = NewImage(_gameHud.transform, "actslot" + i, new Vector2(0.5f, 0f), new Vector2(0.5f, 0f),
                new Vector2(-190 + i * 90, 112), new Vector2(74, 74));
            slotBg.sprite = CircleSprite();
            slotBg.color = new Color(0.05f, 0.05f, 0.15f, 0.7f);
            var fill = NewImage(slotBg.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            fill.sprite = CircleSprite();
            fill.type = Image.Type.Filled;
            fill.fillMethod = Image.FillMethod.Radial360;
            fill.fillOrigin = (int)Image.Origin360.Top;
            fill.color = new Color(0f, 0f, 0f, 0f);
            var slotIcon = NewImage(slotBg.transform, "icon", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(58, 58));
            slotIcon.preserveAspect = true;
            slotIcon.enabled = false;
            _actIcons.Add(slotIcon);
            _actFills.Add(fill);
            fill.transform.SetAsLastSibling();   // cooldown sweep stays over the art
            var ab = NewText(slotBg.transform, "abbrev", "", 19, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            ab.fontStyle = FontStyle.Bold;
            _actAbbrevs.Add(ab);
            var key = NewText(slotBg.transform, "key", (i + 1).ToString(), 16, TextAnchor.UpperCenter,
                new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, -3), new Vector2(30, 20));
            key.color = new Color(0.7f, 0.8f, 1f, 0.7f);
        }

        _bannerText = NewText(_gameHud.transform, "banner", "", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.65f), new Vector2(0.5f, 0.65f), Vector2.zero, new Vector2(1400, 90));
        _bannerText.color = new Color(1f, 0.4f, 0.85f, 0f);
        _bannerText.fontStyle = FontStyle.BoldAndItalic;
        _bannerText.font = _titleFont;

        // XP bar across the very top + level chip
        var xpBg = NewImage(_gameHud.transform, "xpbg", new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -6), new Vector2(900, 8));
        xpBg.color = new Color(0.05f, 0.05f, 0.15f, 0.8f);
        _xpBar = NewImage(xpBg.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _xpBar.color = new Color(0.4f, 0.95f, 1f);
        _xpBar.type = Image.Type.Filled;
        _xpBar.fillMethod = Image.FillMethod.Horizontal;
        _xpBar.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        _xpLevelText = NewText(_gameHud.transform, "xplevel", "LV 1", 22, TextAnchor.UpperCenter,
            new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -14), new Vector2(200, 30));
        _xpLevelText.color = new Color(0.4f, 0.95f, 1f);
        _xpLevelText.fontStyle = FontStyle.Bold;

        _timerText = NewText(_gameHud.transform, "timer", "", 34, TextAnchor.UpperCenter,
            new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -46), new Vector2(300, 44));
        _timerText.color = new Color(1f, 0.85f, 0.4f);
        _timerText.fontStyle = FontStyle.Bold;

        // pooled direction indicators: yellow = offscreen enemy, red = incoming fire
        _arrowSprite = ArrowSprite();
        for (int i = 0; i < 20; i++)
        {
            var ind = NewImage(_gameHud.transform, "dir" + i, Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(30, 30));
            ind.sprite = _arrowSprite;
            ind.gameObject.SetActive(false);
            _dirPool.Add(ind);
        }

        BuildStartPanel();
        BuildOverPanel();
        BuildWinPanel();
        BuildLevelUpPanel();
        BuildTournamentPanels();
        BuildSettingsPanel();
        _gameHud.SetActive(false);
    }

    // ---------- direction indicators ----------
    void UpdateIndicators(Health player)
    {
        var cam = Camera.main;
        int used = 0;
        if (cam != null)
        {
            // yellow arrows for hostiles outside the view
            foreach (var h in SkillSystem.AllHostiles())
            {
                if (used >= _dirPool.Count) break;
                Vector3 vp = cam.WorldToViewportPoint(h.transform.position);
                bool onScreen = vp.z > 0f && vp.x > 0f && vp.x < 1f && vp.y > 0f && vp.y < 1f;
                if (onScreen) continue;
                PlaceEdgeIndicator(_dirPool[used++], vp, new Color(1f, 0.85f, 0.2f, 0.85f), 30f);
            }

            // incoming-fire check: does any bolt hit within ~1 second?
            bool threat = false;
            if (GameSettings.HitWarning)
            {
                var prb = player.GetComponent<Rigidbody>();
                Vector3 playerVel = prb != null ? prb.linearVelocity : Vector3.zero;
                foreach (var bolt in Projectile.EnemyBolts)
                {
                    if (bolt == null || !bolt.gameObject.activeSelf) continue;
                    Vector3 rel = bolt.transform.position - player.transform.position;
                    Vector3 relVel = bolt.Velocity - playerVel;
                    float a = Vector3.Dot(relVel, relVel);
                    if (a < 0.01f) continue;
                    float tStar = -Vector3.Dot(rel, relVel) / a;
                    if (tStar < 0f || tStar > 1f) continue;                // not hitting inside 1s
                    if ((rel + relVel * tStar).magnitude > 5f) continue;   // will miss anyway
                    threat = true;
                    break;
                }
            }
            float warnAlpha = threat ? 0.35f + 0.4f * Mathf.Abs(Mathf.Sin(Time.time * 14f)) : 0f;
            _warnBorder.color = new Color(1f, 0.12f, 0.18f, warnAlpha);
        }
        for (int i = used; i < _dirPool.Count; i++)
            if (_dirPool[i].gameObject.activeSelf) _dirPool[i].gameObject.SetActive(false);
    }

    void PlaceEdgeIndicator(Image ind, Vector3 vp, Color color, float size)
    {
        if (vp.z < 0f) { vp.x = 1f - vp.x; vp.y = 1f - vp.y; }   // behind the camera: mirror
        Vector2 dir = new Vector2(vp.x - 0.5f, vp.y - 0.5f);
        if (dir.sqrMagnitude < 0.0001f) dir = Vector2.up;
        // push to the screen border
        float scale = Mathf.Max(Mathf.Abs(dir.x) / 0.46f, Mathf.Abs(dir.y) / 0.44f);
        dir /= Mathf.Max(scale, 0.0001f);
        Vector2 screenPos = new Vector2((0.5f + dir.x) * Screen.width, (0.5f + dir.y) * Screen.height);
        ind.gameObject.SetActive(true);
        ind.color = color;
        ind.rectTransform.sizeDelta = new Vector2(size, size);
        ind.rectTransform.position = new Vector3(screenPos.x, screenPos.y, 0f);
        ind.rectTransform.rotation = Quaternion.Euler(0f, 0f, Mathf.Atan2(dir.y, dir.x) * Mathf.Rad2Deg - 90f);
    }

    public void SetTimer(float secondsLeft)
    {
        secondsLeft = Mathf.Max(0f, secondsLeft);
        bool overtime = secondsLeft <= TournamentMode.Overtime;
        _timerText.text = (overtime ? "OT " : "") + Mathf.FloorToInt(secondsLeft / 60f) + ":" + Mathf.FloorToInt(secondsLeft % 60f).ToString("00");
        _timerText.color = overtime ? new Color(1f, 0.35f, 0.5f) : new Color(1f, 0.85f, 0.4f);
    }

    public void ShowTournamentResults(string reason, int score, string verify, string matchCode, List<TournamentMode.Entry> standings)
    {
        _gameHud.SetActive(false);
        _levelUpPanel.SetActive(false);
        _tourneyResultsPanel.SetActive(true);
        _warnBorder.color = new Color(1, 1, 1, 0);
        _resultsTitle.text = reason;
        _resultsScore.text = score.ToString("N0");
        _resultsVerify.text = "MATCH " + matchCode + "   ·   VERIFY CODE  " + verify;
        var sb = new System.Text.StringBuilder("— LOCAL STANDINGS —\n");
        int rank = 1;
        foreach (var e in standings)
        {
            sb.AppendLine(rank + ".  " + e.name + "   " + e.score.ToString("N0") + "   [" + e.verify + "]");
            if (++rank > 8) break;
        }
        _resultsStandings.text = sb.ToString();
        Invoke(nameof(EnableRestart), 1.5f);
    }

    public void ShowLevelUp(int level, List<LevelUpChoices> choices, System.Action<LevelUpChoices> onPick)
    {
        foreach (var c in _levelUpCards) Destroy(c);
        _levelUpCards.Clear();
        _levelUpPanel.SetActive(true);
        _levelUpPanel.transform.Find("title").GetComponent<Text>().text = "LEVEL " + level + " — CHOOSE";

        for (int i = 0; i < choices.Count; i++)
        {
            var choice = choices[i];
            var card = new GameObject("choice" + i);
            card.transform.SetParent(_levelUpPanel.transform, false);
            var img = card.AddComponent<Image>();
            img.color = new Color(0.07f, 0.05f, 0.16f, 0.97f);
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.45f);
            rt.anchoredPosition = new Vector2((i - (choices.Count - 1) * 0.5f) * 380f, 0f);
            rt.sizeDelta = new Vector2(340, 300);
            var btn = card.AddComponent<Button>();
            var colors = btn.colors;
            colors.highlightedColor = new Color(1.7f, 1.7f, 2f);
            colors.pressedColor = new Color(2f, 2f, 2.4f);
            btn.colors = colors;
            btn.onClick.AddListener(() => {
                _levelUpPanel.SetActive(false);
                onPick(choice);
            });

            if (choice.sprite != null)
            {
                var iconImg = NewImage(card.transform, "iconimg", new Vector2(0.5f, 0.76f), new Vector2(0.5f, 0.76f), Vector2.zero, new Vector2(110, 110));
                iconImg.sprite = choice.sprite;
                iconImg.preserveAspect = true;
            }
            else
            {
                var icon = NewText(card.transform, "icon", choice.icon, 60, TextAnchor.MiddleCenter,
                    new Vector2(0.5f, 0.78f), new Vector2(0.5f, 0.78f), Vector2.zero, new Vector2(320, 80));
            }
            var name = NewText(card.transform, "name", choice.title, 24, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.55f), new Vector2(0.5f, 0.55f), Vector2.zero, new Vector2(320, 70));
            name.color = new Color(1f, 0.85f, 0.4f);
            name.fontStyle = FontStyle.Bold;
            var desc = NewText(card.transform, "desc", choice.desc, 19, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.26f), new Vector2(0.5f, 0.26f), Vector2.zero, new Vector2(310, 110));
            desc.color = new Color(0.85f, 0.9f, 1f, 0.9f);
            _levelUpCards.Add(card);
        }
    }

    // ---------- panels ----------
    void BuildStartPanel()
    {
        _startPanel = Panel("StartPanel");
        // v1-style logo: chunky Luckiest Guy, red ZEAL over gold SURVIVORS
        var zeal = NewText(_startPanel.transform, "titleZeal", "ZEAL", 84, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.875f), new Vector2(0.5f, 0.875f), Vector2.zero, new Vector2(1200, 100));
        zeal.font = _titleFont;
        zeal.color = new Color(0.85f, 0.36f, 0.42f);
        var surv = NewText(_startPanel.transform, "titleSurv", "SURVIVORS", 76, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.795f), new Vector2(0.5f, 0.795f), Vector2.zero, new Vector2(1500, 95));
        surv.font = _titleFont;
        surv.color = new Color(0.98f, 0.78f, 0.25f);
        var v2 = NewText(_startPanel.transform, "v2", "V2 — THE VOID", 34, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.725f), new Vector2(0.5f, 0.725f), Vector2.zero, new Vector2(1000, 50));
        v2.font = _titleFont;
        v2.color = new Color(1f, 0.55f, 0.9f);
        foreach (var logo in new[] { zeal, surv })
        {
            var o = logo.GetComponent<Outline>();
            o.effectColor = new Color(0.13f, 0.07f, 0.2f, 1f);
            o.effectDistance = new Vector2(4, -5);   // thick drop for the 3D sticker feel
            var glow = logo.gameObject.AddComponent<Outline>();
            glow.effectColor = new Color(1f, 0.9f, 0.5f, 0.25f);
            glow.effectDistance = new Vector2(-3, 3);
        }
        var s = NewText(_startPanel.transform, "sub", "CLEAR 10 WAVES — DESTROY THE VOID DREADNOUGHT", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.7f), new Vector2(0.5f, 0.7f), Vector2.zero, new Vector2(1600, 36));
        s.color = new Color(0.8f, 0.9f, 1f, 0.8f);
        var pick = NewText(_startPanel.transform, "pick", "CHOOSE YOUR EGO", 32, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.64f), new Vector2(0.5f, 0.64f), Vector2.zero, new Vector2(800, 50));
        pick.color = new Color(1f, 0.85f, 0.4f);
        pick.font = _titleFont;

        for (int i = 0; i < ZealData.Pilots.Length; i++)
        {
            var pilot = ZealData.Pilots[i];
            int idx = i;
            var card = new GameObject("pilot-" + pilot.id);
            card.transform.SetParent(_startPanel.transform, false);
            var img = card.AddComponent<Image>();
            img.color = new Color(0.07f, 0.05f, 0.16f, 0.95f);
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.42f);
            rt.anchoredPosition = new Vector2((i - 1.5f) * 330f, 0f);
            rt.sizeDelta = new Vector2(300, 260);
            var btn = card.AddComponent<Button>();
            var colors = btn.colors;
            colors.highlightedColor = new Color(1.6f, 1.6f, 1.9f);
            colors.pressedColor = new Color(2f, 2f, 2.4f);
            btn.colors = colors;
            btn.onClick.AddListener(() => {
                _startPanel.SetActive(false);
                _gameHud.SetActive(true);
                GameManager.I.StartRun(idx);
            });

            var edge = NewImage(card.transform, "edge", Vector2.zero, new Vector2(1, 0), new Vector2(0, 4), new Vector2(0, 8));
            edge.color = pilot.accent;
            var name = NewText(card.transform, "name", pilot.name, 30, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.82f), new Vector2(0.5f, 0.82f), Vector2.zero, new Vector2(290, 40));
            name.color = pilot.accent;
            name.font = _titleFont;
            var title = NewText(card.transform, "ptitle", pilot.title.ToUpperInvariant(), 17, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(290, 30));
            title.color = new Color(0.85f, 0.9f, 1f, 0.8f);
            string specialLine = pilot.id == "ego" ? "RMB — ZEAL BOLT beam"
                : pilot.id == "captain" ? "RMB — CUTLASS storm"
                : pilot.id == "chef" ? "RMB — SCALDING PIE homing"
                : "RMB — STORM MARK chain";
            var spcText = NewText(card.transform, "special", specialLine, 18, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(290, 30));
            spcText.color = new Color(1f, 0.85f, 0.4f);
            var perk = NewText(card.transform, "perk", pilot.perkText, 17, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.26f), new Vector2(0.5f, 0.26f), Vector2.zero, new Vector2(280, 80));
            perk.color = new Color(0.8f, 0.9f, 1f, 0.85f);
        }

        var ctl = NewText(_startPanel.transform, "controls", "MOUSE aim · WASD move · SHIFT up / CTRL down · SPACE dash (spins!) · G guard (½ dmg, attack drops it, 5s CD) · LMB fire · RMB special · V 1st/3rd person · M mute\nCollect XP shards — choose upgrades on level up", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.12f), new Vector2(0.5f, 0.12f), Vector2.zero, new Vector2(1500, 80));
        ctl.color = new Color(0.8f, 0.9f, 1f, 0.7f);

        MakeButton(_startPanel.transform, "BLITZ TOURNAMENT", new Vector2(0.41f, 0.21f), new Vector2(340, 54),
            new Color(1f, 0.55f, 0.9f), () => { _startPanel.SetActive(false); _tourneySetupPanel.SetActive(true); });
        MakeButton(_startPanel.transform, "SETTINGS", new Vector2(0.59f, 0.21f), new Vector2(340, 54),
            new Color(0.6f, 0.9f, 1f), () => { _startPanel.SetActive(false); _settingsPanel.SetActive(true); });

        _startPanel.SetActive(false);
    }

    void BuildSettingsPanel()
    {
        _settingsPanel = Panel("SettingsPanel");
        var t = NewText(_settingsPanel.transform, "title", "SETTINGS", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.78f), new Vector2(0.5f, 0.78f), Vector2.zero, new Vector2(1200, 90));
        t.color = new Color(0.6f, 0.9f, 1f);
        t.font = _titleFont;

        var lbl = NewText(_settingsPanel.transform, "warnlbl", "INCOMING HIT WARNING", 28, TextAnchor.MiddleRight,
            new Vector2(0.5f, 0.55f), new Vector2(0.5f, 0.55f), new Vector2(-110, 0), new Vector2(520, 44));
        lbl.color = new Color(0.9f, 0.95f, 1f);
        var desc = NewText(_settingsPanel.transform, "warndesc", "Flashes a red screen border when enemy fire will hit you within 1 second", 18, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.48f), new Vector2(0.5f, 0.48f), Vector2.zero, new Vector2(900, 32));
        desc.color = new Color(0.7f, 0.8f, 1f, 0.7f);

        Text toggleLabel = null;
        var btn = MakeButton(_settingsPanel.transform, GameSettings.HitWarning ? "ON" : "OFF",
            new Vector2(0.5f, 0.55f), new Vector2(140, 48),
            GameSettings.HitWarning ? new Color(0.5f, 1f, 0.6f) : new Color(1f, 0.5f, 0.5f), () => { });
        btn.transform.localPosition += new Vector3(220, 0, 0);
        toggleLabel = btn.GetComponentInChildren<Text>();
        btn.onClick.AddListener(() => {
            GameSettings.HitWarning = !GameSettings.HitWarning;
            toggleLabel.text = GameSettings.HitWarning ? "ON" : "OFF";
            toggleLabel.color = GameSettings.HitWarning ? new Color(0.5f, 1f, 0.6f) : new Color(1f, 0.5f, 0.5f);
        });

        MakeButton(_settingsPanel.transform, "BACK", new Vector2(0.5f, 0.2f), new Vector2(300, 56),
            new Color(0.8f, 0.9f, 1f), () => { _settingsPanel.SetActive(false); _startPanel.SetActive(true); });
        _settingsPanel.SetActive(false);
    }

    void BuildTournamentPanels()
    {
        // ----- setup -----
        _tourneySetupPanel = Panel("TourneySetup");
        var t = NewText(_tourneySetupPanel.transform, "title", "BLITZ TOURNAMENT", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.78f), new Vector2(0.5f, 0.78f), Vector2.zero, new Vector2(1400, 90));
        t.color = new Color(1f, 0.55f, 0.9f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
        var sub = NewText(_tourneySetupPanel.transform, "sub", "5-MINUTE SEEDED RUN + 1 MINUTE OVERTIME · +20% XP · SAME CODE = SAME PILOT, WAVES, DRAFTS\nSCORE BIG BEFORE THE CLOCK RUNS OUT — VERIFY CODE PROVES YOUR RUN", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(1400, 60));
        sub.color = new Color(0.8f, 0.9f, 1f, 0.8f);

        NewText(_tourneySetupPanel.transform, "lbl1", "MATCH CODE", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.585f), new Vector2(0.5f, 0.585f), Vector2.zero, new Vector2(400, 30))
            .color = new Color(1f, 0.85f, 0.4f);
        _codeInput = MakeInput(_tourneySetupPanel.transform, new Vector2(0.5f, 0.525f), "ZEAL-2026");
        NewText(_tourneySetupPanel.transform, "lbl2", "PILOT NAME", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.445f), new Vector2(0.5f, 0.445f), Vector2.zero, new Vector2(400, 30))
            .color = new Color(1f, 0.85f, 0.4f);
        _nameInput = MakeInput(_tourneySetupPanel.transform, new Vector2(0.5f, 0.385f), "YOUR CALLSIGN");

        _tourneyPilotPreview = NewText(_tourneySetupPanel.transform, "preview", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.3f), Vector2.zero, new Vector2(900, 34));
        _tourneyPilotPreview.color = new Color(0.5f, 0.95f, 1f);
        _codeInput.onValueChanged.AddListener(_ => UpdatePilotPreview());
        UpdatePilotPreview();

        MakeButton(_tourneySetupPanel.transform, "START MATCH", new Vector2(0.42f, 0.2f), new Vector2(300, 56),
            new Color(0.5f, 1f, 0.6f), () => {
                TournamentMode.Arm(_codeInput.text, _nameInput.text);
                _tourneySetupPanel.SetActive(false);
                _gameHud.SetActive(true);
                GameManager.I.StartRun(TournamentMode.PilotIndex);
            });
        MakeButton(_tourneySetupPanel.transform, "BACK", new Vector2(0.58f, 0.2f), new Vector2(300, 56),
            new Color(0.8f, 0.9f, 1f), () => { _tourneySetupPanel.SetActive(false); _startPanel.SetActive(true); });
        _tourneySetupPanel.SetActive(false);

        // ----- results -----
        _tourneyResultsPanel = Panel("TourneyResults");
        _resultsTitle = NewText(_tourneyResultsPanel.transform, "title", "TIME!", 76, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.8f), new Vector2(0.5f, 0.8f), Vector2.zero, new Vector2(1400, 100));
        _resultsTitle.color = new Color(1f, 0.55f, 0.9f);
        _resultsTitle.font = _titleFont;
        _resultsScore = NewText(_tourneyResultsPanel.transform, "score", "0", 80, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.66f), new Vector2(0.5f, 0.66f), Vector2.zero, new Vector2(1200, 100));
        _resultsScore.color = new Color(0.5f, 0.95f, 1f);
        _resultsScore.fontStyle = FontStyle.Bold;
        _resultsVerify = NewText(_tourneyResultsPanel.transform, "verify", "", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.56f), new Vector2(0.5f, 0.56f), Vector2.zero, new Vector2(1200, 40));
        _resultsVerify.color = new Color(1f, 0.85f, 0.4f);
        _resultsStandings = NewText(_tourneyResultsPanel.transform, "standings", "", 22, TextAnchor.UpperCenter,
            new Vector2(0.5f, 0.48f), new Vector2(0.5f, 0.48f), Vector2.zero, new Vector2(900, 260));
        _resultsStandings.color = new Color(0.85f, 0.9f, 1f, 0.9f);
        var p = NewText(_tourneyResultsPanel.transform, "pulse", "CLICK TO CONTINUE", 30, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.1f), new Vector2(0.5f, 0.1f), Vector2.zero, new Vector2(800, 50));
        p.color = new Color(1f, 0.85f, 0.4f);
        p.fontStyle = FontStyle.Bold;
        _tourneyResultsPanel.SetActive(false);
    }

    void UpdatePilotPreview()
    {
        string code = string.IsNullOrEmpty(_codeInput.text) ? "OPEN" : _codeInput.text.Trim().ToUpperInvariant();
        var pilot = ZealData.Pilots[(int)(TournamentMode.Hash32(code) % (uint)ZealData.Pilots.Length)];
        _tourneyPilotPreview.text = "MATCH PILOT:  " + pilot.name.ToUpperInvariant() + " — " + pilot.title.ToUpperInvariant();
    }

    Button MakeButton(Transform parent, string label, Vector2 anchor, Vector2 size, Color color, UnityEngine.Events.UnityAction onClick)
    {
        var go = new GameObject("btn-" + label);
        go.transform.SetParent(parent, false);
        var img = go.AddComponent<Image>();
        img.color = new Color(0.09f, 0.07f, 0.2f, 0.97f);
        var rt = img.rectTransform;
        rt.anchorMin = rt.anchorMax = anchor;
        rt.sizeDelta = size;
        var btn = go.AddComponent<Button>();
        var colors = btn.colors;
        colors.highlightedColor = new Color(1.6f, 1.6f, 1.9f);
        colors.pressedColor = new Color(2f, 2f, 2.4f);
        btn.colors = colors;
        btn.onClick.AddListener(onClick);
        var txt = NewText(go.transform, "label", label, 24, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, size);
        txt.color = color;
        txt.fontStyle = FontStyle.Bold;
        return btn;
    }

    InputField MakeInput(Transform parent, Vector2 anchor, string placeholder)
    {
        var go = new GameObject("input");
        go.transform.SetParent(parent, false);
        var img = go.AddComponent<Image>();
        img.color = new Color(0.05f, 0.04f, 0.14f, 0.98f);
        var rt = img.rectTransform;
        rt.anchorMin = rt.anchorMax = anchor;
        rt.sizeDelta = new Vector2(460, 52);
        var field = go.AddComponent<InputField>();
        var txt = NewText(go.transform, "text", "", 26, TextAnchor.MiddleCenter,
            Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        txt.rectTransform.offsetMin = new Vector2(12, 4);
        txt.rectTransform.offsetMax = new Vector2(-12, -4);
        txt.supportRichText = false;
        var ph = NewText(go.transform, "placeholder", placeholder, 26, TextAnchor.MiddleCenter,
            Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        ph.rectTransform.offsetMin = new Vector2(12, 4);
        ph.rectTransform.offsetMax = new Vector2(-12, -4);
        ph.color = new Color(0.6f, 0.65f, 0.85f, 0.45f);
        ph.fontStyle = FontStyle.Italic;
        field.textComponent = txt;
        field.placeholder = ph;
        field.characterLimit = 24;
        return field;
    }

    void BuildLevelUpPanel()
    {
        _levelUpPanel = Panel("LevelUpPanel");
        var t = NewText(_levelUpPanel.transform, "title", "LEVEL UP", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.74f), new Vector2(0.5f, 0.74f), Vector2.zero, new Vector2(1200, 90));
        t.color = new Color(0.4f, 0.95f, 1f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
        _levelUpPanel.SetActive(false);
    }

    void BuildOverPanel()
    {
        _overPanel = Panel("OverPanel");
        var t = NewText(_overPanel.transform, "title", "SHIP DESTROYED", 84, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(1600, 110));
        t.color = new Color(1f, 0.35f, 0.5f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
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

    void BuildWinPanel()
    {
        _winPanel = Panel("WinPanel");
        var t = NewText(_winPanel.transform, "title", "SECTOR CLEARED", 92, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(1600, 120));
        t.color = new Color(0.5f, 1f, 0.6f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
        var sub = NewText(_winPanel.transform, "sub", "THE VOID DREADNOUGHT IS DUST", 30, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.59f), new Vector2(0.5f, 0.59f), Vector2.zero, new Vector2(1400, 50));
        sub.color = new Color(1f, 0.55f, 0.9f);
        _winScore = NewText(_winPanel.transform, "score", "0", 90, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.47f), new Vector2(0.5f, 0.47f), Vector2.zero, new Vector2(1200, 120));
        _winScore.color = new Color(0.5f, 0.95f, 1f);
        _winScore.fontStyle = FontStyle.Bold;
        _winBest = NewText(_winPanel.transform, "best", "", 30, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.36f), new Vector2(0.5f, 0.36f), Vector2.zero, new Vector2(1200, 50));
        _winBest.color = new Color(1f, 0.85f, 0.4f);
        var p = NewText(_winPanel.transform, "pulse", "CLICK TO FLY AGAIN", 34, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.2f), new Vector2(0.5f, 0.2f), Vector2.zero, new Vector2(800, 60));
        p.color = new Color(1f, 0.85f, 0.4f);
        p.fontStyle = FontStyle.Bold;
        _winPanel.SetActive(false);
    }

    // ---------- public API ----------
    public void ShowStart() { _startPanel.SetActive(true); WantsStart = true; }
    public void ShowGameHud() { WantsStart = false; _startPanel.SetActive(false); _gameHud.SetActive(true); }

    public void ShowGameOver(int score, int best, bool newBest, int wave)
    {
        _gameHud.SetActive(false);
        _overPanel.SetActive(true);
        _warnBorder.color = new Color(1, 1, 1, 0);
        _overScore.text = score.ToString("N0");
        _overBest.text = newBest ? "NEW BEST!" : "BEST  " + best.ToString("N0");
        _overStats.text = "Reached wave " + wave + " / " + WaveDirector.FinalWave;
        Invoke(nameof(EnableRestart), 1.2f);
    }
    void EnableRestart() { WantsRestart = true; }

    public void ShowVictory(int score, int best, bool newBest)
    {
        _gameHud.SetActive(false);
        _winPanel.SetActive(true);
        _warnBorder.color = new Color(1, 1, 1, 0);
        _winScore.text = score.ToString("N0");
        _winBest.text = newBest ? "NEW BEST!" : "BEST  " + best.ToString("N0");
        Invoke(nameof(EnableRestart), 1.5f);
    }

    public void Tick(Health player, WaveDirector waves, int score)
    {
        _wavesRef = waves;
        _scoreText.text = score.ToString("N0");
        _waveText.text = "WAVE " + Mathf.Max(1, waves.wave) + " / " + WaveDirector.FinalWave;
        _hostilesText.text = waves.hostilesAlive > 0 ? waves.hostilesAlive + " HOSTILE" + (waves.hostilesAlive > 1 ? "S" : "") : "";
        _shieldBar.fillAmount = player.maxShield > 0 ? player.shield / player.maxShield : 0f;
        _hullBar.fillAmount = player.hull / player.maxHull;

        var ship = player.GetComponent<ShipController>();
        if (ship != null)
        {
            string dash = ship.dashCooldown <= 0f ? "DASH RDY" : "DASH " + ship.dashCooldown.ToString("0.0") + "s";
            string guard = ship.guarding ? "GUARDING" : ship.guardCooldown <= 0f ? "GUARD RDY" : "GUARD " + Mathf.CeilToInt(ship.guardCooldown) + "s";
            _throttleText.text = "SPD " + Mathf.RoundToInt(ship.currentSpeed) + "   " + dash + "   " + guard;
        }

        var weapon = player.GetComponent<Weapon>();
        if (weapon != null)
        {
            string status = "ZEAL SIGIL LV " + weapon.sigilLevel;
            if (weapon.rapidTimer > 0f) status += "   RAPID " + Mathf.CeilToInt(weapon.rapidTimer) + "s";
            var spc = player.GetComponent<SpecialAttack>();
            if (spc != null && spc.DisplayName != null)
            {
                status += "\nRMB " + spc.DisplayName;
                bool ready = spc.cooldownLeft <= 0f;
                _skillFill.fillAmount = spc.CooldownTotal > 0f ? 1f - spc.cooldownLeft / spc.CooldownTotal : 1f;
                _skillFill.color = ready
                    ? new Color(1f, 0.85f, 0.4f, 0.95f)
                    : new Color(0.4f, 0.6f, 0.9f, 0.55f);
                _skillCdText.text = ready ? "" : Mathf.CeilToInt(spc.cooldownLeft).ToString();
                _skillCdText.color = Color.white;
            }
            var skills = player.GetComponent<SkillSystem>();
            if (skills != null)
                foreach (var ow in skills.weapons)
                    status += "\n" + ow.DisplayIcon + " " + ow.DisplayName + (ow.evolved ? "  ★EVO" : "  LV " + ow.level);
            _weaponText.text = status;
        }

        // XP progress
        _xpBar.fillAmount = Mathf.Clamp01(GameManager.I.xp / (float)ZealData.XpToNext(GameManager.I.xpLevel));
        _xpLevelText.text = "LV " + GameManager.I.xpLevel;

        UpdateIndicators(player);

        // active skill slots
        var acts = player.GetComponent<ActiveSkills>();
        for (int i = 0; i < _actFills.Count; i++)
        {
            if (acts != null && i < acts.slots.Count)
            {
                var slot = acts.slots[i];
                bool ready = slot.cdLeft <= 0f;
                var art = SkillIcons.Active(slot.def.id);
                if (art != null)
                {
                    _actIcons[i].enabled = true;
                    _actIcons[i].sprite = art;
                    _actIcons[i].color = ready ? Color.white : new Color(0.55f, 0.6f, 0.75f, 0.9f);
                    _actAbbrevs[i].text = "";
                }
                else
                {
                    _actIcons[i].enabled = false;
                    _actAbbrevs[i].text = slot.def.abbrev;
                    _actAbbrevs[i].color = ready ? new Color(1f, 0.95f, 0.7f) : new Color(0.7f, 0.75f, 0.9f, 0.8f);
                }
                _actFills[i].fillAmount = 1f - slot.cdLeft / slot.def.cooldown;
                _actFills[i].color = ready ? new Color(1f, 0.85f, 0.4f, 0.3f) : new Color(0.2f, 0.3f, 0.5f, 0.55f);
            }
            else
            {
                _actIcons[i].enabled = false;
                _actAbbrevs[i].text = "";
                _actFills[i].color = new Color(0f, 0f, 0f, 0f);
            }
        }

        // boss bar
        bool bossUp = waves.bossHealth != null;
        if (_bossGroup.activeSelf != bossUp) _bossGroup.SetActive(bossUp);
        if (bossUp)
        {
            var b = waves.bossHealth;
            _bossName.text = waves.bossName;
            _bossBar.fillAmount = (b.shield + b.hull) / (b.maxShield + b.maxHull);
        }

        // fixed center crosshair (mouse-look aiming)
        _reticle.rectTransform.anchoredPosition = Vector2.zero;

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
        bg.color = new Color(0.03f, 0.01f, 0.1f, 0.5f);   // light enough to see the 3D showcase behind
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

    Sprite ArrowSprite()
    {
        const int S = 64;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        // triangle pointing up: apex (32,58), base (10,10)-(54,10)
        Vector2 a = new Vector2(32, 58), b = new Vector2(10, 10), c = new Vector2(54, 10);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
                tex.SetPixel(x, y, new Color(1, 1, 1, InTriangle(new Vector2(x, y), a, b, c) ? 1f : 0f));
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }

    static bool InTriangle(Vector2 p, Vector2 a, Vector2 b, Vector2 c)
    {
        float s1 = Cross(a, b, p), s2 = Cross(b, c, p), s3 = Cross(c, a, p);
        return (s1 >= 0 && s2 >= 0 && s3 >= 0) || (s1 <= 0 && s2 <= 0 && s3 <= 0);
    }
    static float Cross(Vector2 a, Vector2 b, Vector2 p) => (b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x);

    // per-skill logos, all drawn procedurally
    Sprite SkillIconSprite(string pilotId)
    {
        const int S = 64;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
                tex.SetPixel(x, y, SkillIconPixel(pilotId, x, y));
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
    }

    Color SkillIconPixel(string id, int x, int y)
    {
        Color on = Color.white, off = new Color(1, 1, 1, 0);
        switch (id)
        {
            case "ego":   // laser beam: muzzle ball + widening horizontal beam
            {
                if (Vector2.Distance(new Vector2(x, y), new Vector2(12, 32)) < 9f) return on;
                float half = 3f + (x - 12) * 0.14f;
                if (x > 12 && Mathf.Abs(y - 32) < half) return on;
                if (x > 12 && Mathf.Abs(y - 32) < half + 4f) return new Color(1, 1, 1, 0.35f);
                return off;
            }
            case "captain":   // upright sword: blade, guard, grip, pommel
            {
                float tipHalf = y > 48 ? Mathf.Max(0f, (58f - y) * 0.45f) : 3.4f;
                if (y >= 20 && y <= 58 && Mathf.Abs(x - 32) <= tipHalf) return on;
                if (y >= 15 && y < 20 && Mathf.Abs(x - 32) <= 11) return on;
                if (y >= 6 && y < 15 && Mathf.Abs(x - 32) <= 2.6f) return on;
                if (Vector2.Distance(new Vector2(x, y), new Vector2(32, 5)) < 3.2f) return on;
                return off;
            }
            case "chef":   // whole pie: crust rim, filling, lattice
            {
                float d = Vector2.Distance(new Vector2(x, y), new Vector2(32, 32));
                if (d > 25f) return off;
                if (d > 20f) return on;                                  // crust
                bool lattice = (x + y) % 14 < 3 || (x - y + 128) % 14 < 3;
                return lattice ? on : new Color(1, 1, 1, 0.45f);         // filling
            }
            default:   // lightning bolt zigzag
            {
                Vector2 p = new Vector2(x, y);
                bool inBolt =
                    InTriangle(p, new Vector2(38, 58), new Vector2(18, 30), new Vector2(34, 34)) ||
                    InTriangle(p, new Vector2(38, 58), new Vector2(34, 34), new Vector2(44, 40)) ||
                    InTriangle(p, new Vector2(30, 34), new Vector2(20, 28), new Vector2(46, 30)) ||
                    InTriangle(p, new Vector2(26, 6), new Vector2(46, 30), new Vector2(20, 28));
                return inBolt ? on : off;
            }
        }
    }

    Sprite CircleSprite()
    {
        const int S = 64;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                float d = Vector2.Distance(new Vector2(x, y), new Vector2(S / 2f, S / 2f)) / (S / 2f);
                tex.SetPixel(x, y, new Color(1, 1, 1, Mathf.Clamp01((0.95f - d) * 12f)));
            }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f));
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
