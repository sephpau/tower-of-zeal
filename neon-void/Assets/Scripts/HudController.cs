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
    Text _scoreText, _waveText, _hostilesText, _comboText, _bannerText, _announceText, _throttleText, _weaponText, _bossName;
    Image _shieldBar, _hullBar, _vignette, _reticle, _bossBar, _warnBorder;
    GameObject _settingsPanel;
    GameObject _gameHud, _startPanel, _overPanel, _winPanel, _bossGroup;
    Text _overScore, _overBest, _overStats, _winScore, _winBest;
    float _bannerTimer, _announceTimer, _vignetteAlpha;
    WaveDirector _wavesRef;

    Text _xpLevelText, _timerText, _skillCdText, _skillLabel, _liveBoardText;
    Image _xpBar, _skillFill, _skillIconImg;
    string _skillIconFor;
    readonly List<Image> _dirPool = new List<Image>();
    readonly List<Image> _actFills = new List<Image>();
    readonly List<Image> _actIcons = new List<Image>();
    readonly List<Text> _actAbbrevs = new List<Text>();
    Sprite _arrowSprite;
    GameObject _levelUpPanel, _tourneySetupPanel, _tourneyResultsPanel, _homePanel;
    Text _bestHomeText;
    InputField _codeInput, _nameInput;
    Text _tourneyPilotPreview, _resultsTitle, _resultsScore, _resultsVerify, _resultsStandings;
    int _tourneyPilotChoice = -1;                    // -1 = match auto-pick
    readonly List<Button> _tourneyPilotButtons = new List<Button>();
    readonly List<GameObject> _levelUpCards = new List<GameObject>();

    GameObject _coopPanel, _lobbyPanel, _sideLevelPanel;
    GameObject _brPanel, _brLobbyPanel;
    InputField _brRoomInput, _brNameInput;
    Text _brStatus, _brLobbyRoom, _brRoster, _brLobbyStatus, _brCountdown;
    readonly List<Button> _brPilotButtons = new List<Button>();
    readonly List<Text> _brRowTexts = new List<Text>();
    readonly List<Button> _brRowKicks = new List<Button>();
    Button _brStartBtn, _brTeamBtn;
    int _brPilotChoice;
    readonly List<Text> _tagPool = new List<Text>();
    InputField _coopRoomInput, _coopNameInput;
    Text _coopStatus, _lobbyRoom, _lobbyMyName, _lobbyPartnerName, _lobbyPartnerState, _lobbyCountdown, _lobbyStatus;
    readonly List<Button> _lobbyPilotButtons = new List<Button>();
    Button _readyBtn, _blitzBtn, _duelLivesBtn, _duelTimeBtn;
    GameObject _lobbySpin, _brSpin;
    Image _lobbySpinFill, _brSpinFill;
    Text _overPulse;
    List<LevelUpChoices> _sideChoices;
    System.Action<LevelUpChoices> _sidePick;
    readonly List<GameObject> _sideCards = new List<GameObject>();

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

        _liveBoardText = NewText(_gameHud.transform, "liveboard", "", 19, TextAnchor.UpperRight,
            new Vector2(1, 1), new Vector2(1, 1), new Vector2(-30, -108), new Vector2(360, 240));
        _liveBoardText.color = new Color(0.75f, 0.9f, 1f, 0.9f);

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

        // announcer comms line: text-only callouts, below the wave banner
        _announceText = NewText(_gameHud.transform, "announce", "", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.585f), new Vector2(0.5f, 0.585f), Vector2.zero, new Vector2(1200, 40));
        _announceText.color = new Color(0.55f, 0.95f, 1f, 0f);
        _announceText.fontStyle = FontStyle.Bold;

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

        _roundedFill = RoundedSprite(false);
        _roundedOutline = RoundedSprite(true);

        // pooled direction indicators: yellow = offscreen enemy, red = incoming fire
        _arrowSprite = ArrowSprite();
        for (int i = 0; i < 20; i++)
        {
            var ind = NewImage(_gameHud.transform, "dir" + i, Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(30, 30));
            ind.sprite = _arrowSprite;
            ind.gameObject.SetActive(false);
            _dirPool.Add(ind);
        }

        // pooled floating health bars: shield row over hull row, placed above
        // enemies (and the co-op partner) each frame
        var fillSprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        for (int i = 0; i < 24; i++)
        {
            var bg = NewImage(_gameHud.transform, "hpbar" + i, Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(58, 11));
            bg.color = new Color(0.02f, 0.02f, 0.08f, 0.7f);
            var sh = NewImage(bg.transform, "sh", new Vector2(0f, 0.55f), new Vector2(1f, 1f), Vector2.zero, Vector2.zero);
            sh.rectTransform.offsetMin = new Vector2(1, 0);
            sh.rectTransform.offsetMax = new Vector2(-1, -1);
            sh.sprite = fillSprite;
            sh.type = Image.Type.Filled;
            sh.fillMethod = Image.FillMethod.Horizontal;
            var hu = NewImage(bg.transform, "hu", new Vector2(0f, 0f), new Vector2(1f, 0.45f), Vector2.zero, Vector2.zero);
            hu.rectTransform.offsetMin = new Vector2(1, 1);
            hu.rectTransform.offsetMax = new Vector2(-1, 0);
            hu.sprite = fillSprite;
            hu.type = Image.Type.Filled;
            hu.fillMethod = Image.FillMethod.Horizontal;
            bg.gameObject.SetActive(false);
            _hpBarBgs.Add(bg);
            _hpBarShields.Add(sh);
            _hpBarHulls.Add(hu);
        }
        _partnerTag = NewText(_gameHud.transform, "partnertag", "", 15, TextAnchor.MiddleCenter,
            Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(180, 22));
        _partnerTag.color = new Color(0.4f, 1f, 0.75f);
        _partnerTag.fontStyle = FontStyle.Bold;
        _partnerTag.gameObject.SetActive(false);

        // battle royale name tags — one per possible rival
        for (int i = 0; i < 8; i++)
        {
            var tag = NewText(_gameHud.transform, "brtag" + i, "", 15, TextAnchor.MiddleCenter,
                Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(180, 22));
            tag.fontStyle = FontStyle.Bold;
            tag.gameObject.SetActive(false);
            _tagPool.Add(tag);
        }

        BuildHomePanel();
        BuildStartPanel();
        BuildOverPanel();
        BuildWinPanel();
        BuildLevelUpPanel();
        BuildTournamentPanels();
        BuildAdventurePanel();
        BuildCoopPanel();
        BuildLobbyPanel();
        BuildRoyalePanels();
        BuildSideLevelPanel();
        BuildSettingsPanel();
        _gameHud.SetActive(false);
    }

    // ---------- floating health bars ----------
    readonly List<Image> _hpBarBgs = new List<Image>();
    readonly List<Image> _hpBarShields = new List<Image>();
    readonly List<Image> _hpBarHulls = new List<Image>();
    Text _partnerTag;

    void UpdateWorldBars(Health player)
    {
        var cam = Camera.main;
        int used = 0;
        if (cam != null)
        {
            // teammate first — bar plus name tag
            if (CoopSync.RemoteShip != null && CoopSync.I != null && used < _hpBarBgs.Count)
            {
                Vector3 sp = cam.WorldToScreenPoint(CoopSync.RemoteShip.position + Vector3.up * 5f);
                if (sp.z > 0f)
                {
                    Color side = CoopSync.DuelActive ? new Color(1f, 0.35f, 0.35f) : new Color(0.4f, 1f, 0.75f);
                    PlaceBar(used++, sp,
                        CoopSync.I.partnerShield / CoopSync.I.partnerMaxShield,
                        CoopSync.I.partnerHull / CoopSync.I.partnerMaxHull,
                        true, side);
                    _partnerTag.gameObject.SetActive(true);
                    _partnerTag.text = CoopSync.I.PartnerName.ToUpperInvariant();
                    _partnerTag.color = side;
                    _partnerTag.rectTransform.position = sp + new Vector3(0f, 20f, 0f);
                }
                else _partnerTag.gameObject.SetActive(false);
            }
            else if (_partnerTag.gameObject.activeSelf) _partnerTag.gameObject.SetActive(false);

            // battle royale rivals: red bar + callsign over every live ship
            int tagUsed = 0;
            if (RoyaleSync.Active && RoyaleSync.I != null)
            {
                var myInfo = RoyaleSync.I.MyInfo;
                foreach (var p in RoyaleSync.I.players)
                {
                    if (used >= _hpBarBgs.Count || tagUsed >= _tagPool.Count) break;
                    if (p.ghost == null || !p.ghost.activeSelf || !p.hasPose) continue;
                    Vector3 sp = cam.WorldToScreenPoint(p.ghost.transform.position + Vector3.up * 5f);
                    if (sp.z <= 0f) continue;
                    Color side = RoyaleSync.I.SameTeam(myInfo, p)
                        ? new Color(0.3f, 1f, 0.8f)      // squadmate
                        : new Color(1f, 0.4f, 0.4f);     // target
                    PlaceBar(used++, sp, p.shield / p.maxShield, p.hull / p.maxHull, true, side);
                    var tag = _tagPool[tagUsed++];
                    tag.gameObject.SetActive(true);
                    tag.text = p.name.ToUpperInvariant() + "  " + new string('♥', Mathf.Clamp(p.lives, 0, 3));
                    tag.color = side;
                    tag.rectTransform.position = sp + new Vector3(0f, 20f, 0f);
                }
            }
            for (int i = tagUsed; i < _tagPool.Count; i++)
                if (_tagPool[i].gameObject.activeSelf) _tagPool[i].gameObject.SetActive(false);

            foreach (var h in SkillSystem.AllHostiles())
            {
                if (used >= _hpBarBgs.Count) break;
                if (h == null || !h.gameObject.activeInHierarchy || h.gameObject.name == "missile") continue;
                float dist = Vector3.Distance(cam.transform.position, h.transform.position);
                if (dist > 300f) continue;
                float topOff = 4.5f;
                var sc = h.GetComponent<SphereCollider>();
                if (sc != null) topOff = sc.radius * 1.6f + 1.5f;
                else if (h.GetComponent<BoxCollider>() != null) topOff = 9f;
                Vector3 sp = cam.WorldToScreenPoint(h.transform.position + Vector3.up * topOff);
                if (sp.z <= 0f || sp.x < -40 || sp.x > Screen.width + 40 || sp.y < -20 || sp.y > Screen.height + 20) continue;
                PlaceBar(used++, sp,
                    h.maxShield > 0f ? h.shield / h.maxShield : 0f,
                    h.hull / h.maxHull,
                    h.maxShield > 0f, new Color(1f, 0.45f, 0.35f));
            }
        }
        for (int i = used; i < _hpBarBgs.Count; i++)
            if (_hpBarBgs[i].gameObject.activeSelf) _hpBarBgs[i].gameObject.SetActive(false);
    }

    void PlaceBar(int idx, Vector3 screenPos, float shieldFrac, float hullFrac, bool hasShield, Color hullColor)
    {
        var bg = _hpBarBgs[idx];
        bg.gameObject.SetActive(true);
        bg.rectTransform.position = screenPos;
        _hpBarShields[idx].fillAmount = Mathf.Clamp01(shieldFrac);
        _hpBarShields[idx].color = hasShield ? new Color(0.35f, 0.8f, 1f, 0.95f) : new Color(0, 0, 0, 0);
        _hpBarHulls[idx].fillAmount = Mathf.Clamp01(hullFrac);
        _hpBarHulls[idx].color = hullColor;
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

            // teal arrow toward the co-op partner (red when they're the duel enemy)
            if (CoopSync.RemoteShip != null && used < _dirPool.Count)
            {
                Vector3 pvp = cam.WorldToViewportPoint(CoopSync.RemoteShip.position);
                bool pOn = pvp.z > 0f && pvp.x > 0f && pvp.x < 1f && pvp.y > 0f && pvp.y < 1f;
                if (!pOn) PlaceEdgeIndicator(_dirPool[used++], pvp,
                    CoopSync.DuelActive ? new Color(1f, 0.35f, 0.35f, 0.95f) : new Color(0.3f, 1f, 0.8f, 0.9f), 36f);
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

    public void ShowTournamentResults(string reason, int score, string verify, string matchCode, List<TournamentMode.Entry> standings, bool online = false)
    {
        _gameHud.SetActive(false);
        _levelUpPanel.SetActive(false);
        _tourneyResultsPanel.SetActive(true);
        _warnBorder.color = new Color(1, 1, 1, 0);
        _resultsTitle.text = reason;
        _resultsScore.text = score.ToString("N0");
        _resultsVerify.text = "MATCH " + matchCode + "   ·   VERIFY CODE  " + verify;
        var sb = new System.Text.StringBuilder();
        sb.AppendLine(online ? "— LIVE MATCH STANDINGS —" : "— LOCAL STANDINGS (offline) —");
        int rank = 1;
        foreach (var e in standings)
        {
            sb.AppendLine(rank + ".  " + e.name + (string.IsNullOrEmpty(e.pilot) ? "" : " · " + e.pilot.ToUpperInvariant())
                + "   " + e.score.ToString("N0") + "   [" + e.verify + "]");
            if (++rank > 8) break;
        }
        if (CoopSync.Active && CoopSync.I != null)
        {
            sb.AppendLine("");
            sb.AppendLine(CoopSync.I.MvpLine());
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
            img.sprite = _roundedFill;
            img.type = Image.Type.Sliced;
            img.color = new Color(0.07f, 0.05f, 0.16f, 0.72f);
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
            var cardGlow = NewImage(card.transform, "border", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            cardGlow.sprite = _roundedOutline;
            cardGlow.type = Image.Type.Sliced;
            cardGlow.color = new Color(1f, 0.85f, 0.4f, 0.75f);

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
    void BuildHomePanel()
    {
        _homePanel = Panel("HomePanel");
        // v1-style logo: chunky Luckiest Guy, red ZEAL over gold SURVIVORS
        var zeal = NewText(_homePanel.transform, "titleZeal", "ZEAL", 92, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.845f), new Vector2(0.5f, 0.845f), Vector2.zero, new Vector2(1200, 110));
        zeal.font = _titleFont;
        zeal.color = new Color(0.85f, 0.36f, 0.42f);
        var surv = NewText(_homePanel.transform, "titleSurv", "SURVIVORS", 82, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.755f), new Vector2(0.5f, 0.755f), Vector2.zero, new Vector2(1500, 100));
        surv.font = _titleFont;
        surv.color = new Color(0.98f, 0.78f, 0.25f);
        var v2 = NewText(_homePanel.transform, "v2", "V2 — THE VOID", 36, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.675f), new Vector2(0.5f, 0.675f), Vector2.zero, new Vector2(1000, 52));
        v2.font = _titleFont;
        v2.color = new Color(1f, 0.55f, 0.9f);
        foreach (var logo in new[] { zeal, surv })
        {
            var o = logo.GetComponent<Outline>();
            o.effectColor = new Color(0.13f, 0.07f, 0.2f, 1f);
            o.effectDistance = new Vector2(4, -5);
            var glow = logo.gameObject.AddComponent<Outline>();
            glow.effectColor = new Color(1f, 0.9f, 0.5f, 0.25f);
            glow.effectDistance = new Vector2(-3, 3);
        }

        _bestHomeText = NewText(_homePanel.transform, "best", "", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.585f), new Vector2(0.5f, 0.585f), Vector2.zero, new Vector2(700, 40));
        _bestHomeText.color = new Color(0.5f, 0.98f, 1f, 0.9f);
        _bestHomeText.font = _titleFont;

        MakeButton(_homePanel.transform, "PLAY", new Vector2(0.5f, 0.49f), new Vector2(430, 74),
            new Color(1f, 0.85f, 0.4f), () => { _homePanel.SetActive(false); _startPanel.SetActive(true); });
        MakeButton(_homePanel.transform, "ADVENTURE", new Vector2(0.5f, 0.385f), new Vector2(360, 56),
            new Color(1f, 0.72f, 0.25f), () => { _homePanel.SetActive(false); OpenAdventure(); });
        MakeButton(_homePanel.transform, "BLITZ TOURNAMENT", new Vector2(0.5f, 0.31f), new Vector2(360, 56),
            new Color(1f, 0.55f, 0.9f), () => { _homePanel.SetActive(false); _tourneySetupPanel.SetActive(true); });
        MakeButton(_homePanel.transform, "CO-OP (2P)", new Vector2(0.5f, 0.235f), new Vector2(360, 56),
            new Color(0.4f, 1f, 0.75f), () => { _homePanel.SetActive(false); _coopPanel.SetActive(true); });
        MakeButton(_homePanel.transform, "BATTLE ROYALE", new Vector2(0.5f, 0.16f), new Vector2(360, 56),
            new Color(1f, 0.35f, 0.35f), () => { _homePanel.SetActive(false); _brPanel.SetActive(true); });
        MakeButton(_homePanel.transform, "SETTINGS", new Vector2(0.5f, 0.09f), new Vector2(360, 56),
            new Color(0.6f, 0.9f, 1f), () => { _homePanel.SetActive(false); _settingsPanel.SetActive(true); });

        // Discord + Ronin wallet identity corner (top-right)
        BuildIdentityCorner();

        var ctl = NewText(_homePanel.transform, "controls", "MOUSE aim · WASD move · SHIFT up / CTRL down · SPACE dash (spins!) · G guard (½ dmg, attack drops it, 5s CD) · LMB fire · RMB special · V 1st/3rd person · M mute\nCollect XP shards — choose upgrades on level up", 18, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.033f), new Vector2(0.5f, 0.033f), Vector2.zero, new Vector2(1500, 70));
        ctl.color = new Color(0.8f, 0.9f, 1f, 0.7f);
        _homePanel.SetActive(false);
    }

    void BuildStartPanel()   // character select, reached from the homepage
    {
        _startPanel = Panel("SelectPanel");
        var pick = NewText(_startPanel.transform, "pick", "CHOOSE YOUR EGO", 46, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.85f), new Vector2(0.5f, 0.85f), Vector2.zero, new Vector2(1000, 64));
        pick.color = new Color(1f, 0.85f, 0.4f);
        pick.font = _titleFont;

        for (int i = 0; i < ZealData.Pilots.Length; i++)
        {
            var pilot = ZealData.Pilots[i];
            int idx = i;
            var card = new GameObject("pilot-" + pilot.id);
            card.transform.SetParent(_startPanel.transform, false);
            var img = card.AddComponent<Image>();
            img.sprite = _roundedFill;
            img.type = Image.Type.Sliced;
            img.color = new Color(0.07f, 0.05f, 0.16f, 0.62f);
            var rt = img.rectTransform;
            rt.anchorMin = rt.anchorMax = new Vector2(0.5f, 0.5f);
            rt.anchoredPosition = new Vector2((i - 1.5f) * 330f, 0f);
            rt.sizeDelta = new Vector2(300, 370);
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

            var borderGlow = NewImage(card.transform, "border", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            borderGlow.sprite = _roundedOutline;
            borderGlow.type = Image.Type.Sliced;
            borderGlow.color = new Color(pilot.accent.r, pilot.accent.g, pilot.accent.b, 0.85f);
            var edge = NewImage(card.transform, "edge", new Vector2(0.5f, 0f), new Vector2(0.5f, 0f), new Vector2(0, 8), new Vector2(250, 6));
            edge.color = pilot.accent;

            // v1-style card: portrait, TITLE, Name, perks, special skill
            var portraitTex = Resources.Load<Texture2D>("chars/char-" + pilot.id);
            if (portraitTex != null)
            {
                var portrait = NewImage(card.transform, "portrait", new Vector2(0.5f, 0.8f), new Vector2(0.5f, 0.8f), Vector2.zero, new Vector2(130, 130));
                portrait.sprite = Sprite.Create(portraitTex, new Rect(0, 0, portraitTex.width, portraitTex.height), new Vector2(0.5f, 0.5f));
                portrait.preserveAspect = true;
            }
            var title = NewText(card.transform, "ptitle", pilot.title.ToUpperInvariant(), 15, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.575f), new Vector2(0.5f, 0.575f), Vector2.zero, new Vector2(290, 26));
            title.color = new Color(1f, 0.85f, 0.4f, 0.9f);
            var name = NewText(card.transform, "name", pilot.name, 28, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.48f), new Vector2(0.5f, 0.48f), Vector2.zero, new Vector2(290, 40));
            name.color = pilot.accent;
            name.font = _titleFont;
            var perk = NewText(card.transform, "perk", pilot.perkText, 16, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.33f), new Vector2(0.5f, 0.33f), Vector2.zero, new Vector2(280, 70));
            perk.color = new Color(0.8f, 0.9f, 1f, 0.85f);
            string specialName = pilot.id == "ego" ? "ZEAL BOLT"
                : pilot.id == "captain" ? "CORSAIR CUTLASS"
                : pilot.id == "chef" ? "SCALDING PIE"
                : "STORM MARK";
            var spcText = NewText(card.transform, "special", "SPECIAL SKILL:  " + specialName, 16, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.15f), new Vector2(0.5f, 0.15f), Vector2.zero, new Vector2(290, 28));
            spcText.color = new Color(0.4f, 1f, 0.75f);
            spcText.fontStyle = FontStyle.Bold;
        }

        MakeButton(_startPanel.transform, "BACK", new Vector2(0.5f, 0.12f), new Vector2(300, 54),
            new Color(0.8f, 0.9f, 1f), () => { _startPanel.SetActive(false); _homePanel.SetActive(true); });
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
            new Vector2(0.5f, 0.6f), new Vector2(0.5f, 0.6f), new Vector2(-110, 0), new Vector2(520, 44));
        lbl.color = new Color(0.9f, 0.95f, 1f);
        var desc = NewText(_settingsPanel.transform, "warndesc", "Flashes a red screen border when enemy fire will hit you within 1 second", 18, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.545f), new Vector2(0.5f, 0.545f), Vector2.zero, new Vector2(900, 32));
        desc.color = new Color(0.7f, 0.8f, 1f, 0.7f);

        Text toggleLabel = null;
        var btn = MakeButton(_settingsPanel.transform, GameSettings.HitWarning ? "ON" : "OFF",
            new Vector2(0.5f, 0.6f), new Vector2(140, 48),
            GameSettings.HitWarning ? new Color(0.5f, 1f, 0.6f) : new Color(1f, 0.5f, 0.5f), () => { });
        btn.transform.localPosition += new Vector3(220, 0, 0);
        toggleLabel = btn.GetComponentInChildren<Text>();
        btn.onClick.AddListener(() => {
            GameSettings.HitWarning = !GameSettings.HitWarning;
            toggleLabel.text = GameSettings.HitWarning ? "ON" : "OFF";
            toggleLabel.color = GameSettings.HitWarning ? new Color(0.5f, 1f, 0.6f) : new Color(1f, 0.5f, 0.5f);
        });

        // mouse sensitivity: try it live on the test pad to the right
        MakeVolumeRow("MOUSE SENSITIVITY", 0.46f, GameSettings.MouseSensitivity,
            v => GameSettings.MouseSensitivity = v, 0.2f, 3f);
        var pad = NewImage(_settingsPanel.transform, "senspad", new Vector2(0.84f, 0.42f), new Vector2(0.84f, 0.42f), Vector2.zero, new Vector2(260, 260));
        pad.sprite = _roundedFill;
        pad.type = Image.Type.Sliced;
        pad.color = new Color(0.05f, 0.04f, 0.14f, 0.85f);
        var padBorder = NewImage(pad.transform, "border", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        padBorder.sprite = _roundedOutline;
        padBorder.type = Image.Type.Sliced;
        padBorder.color = new Color(0.4f, 1f, 0.75f, 0.5f);
        var padTitle = NewText(_settingsPanel.transform, "padtitle", "MOUSE TEST PAD", 22, TextAnchor.MiddleCenter,
            new Vector2(0.84f, 0.58f), new Vector2(0.84f, 0.58f), Vector2.zero, new Vector2(320, 32));
        padTitle.color = new Color(0.4f, 1f, 0.75f);
        padTitle.font = _titleFont;
        var padHint = NewText(_settingsPanel.transform, "padhint", "MOVE YOUR MOUSE — THE DOT\nMATCHES YOUR IN-GAME AIM SPEED", 15, TextAnchor.MiddleCenter,
            new Vector2(0.84f, 0.25f), new Vector2(0.84f, 0.25f), Vector2.zero, new Vector2(320, 44));
        padHint.color = new Color(0.8f, 0.9f, 1f, 0.7f);
        _sensDot = NewImage(pad.transform, "dot", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(16, 16));
        _sensDot.sprite = CircleSprite();
        _sensDot.color = new Color(0.4f, 1f, 0.75f);

        // volume sliders
        MakeVolumeRow("MUSIC VOLUME", 0.39f, GameSettings.MusicVolume, v => GameSettings.MusicVolume = v);
        MakeVolumeRow("SFX VOLUME", 0.32f, GameSettings.SfxVolume, v => GameSettings.SfxVolume = v);
        MakeVolumeRow("VOICE VOLUME", 0.25f, GameSettings.VoiceVolume, v => {
            GameSettings.VoiceVolume = v;
            CoopNet.SetVoiceVolume(v);   // live-adjust an active co-op call
        });

        // mic test: press START, speak, watch the meter
        var micLbl = NewText(_settingsPanel.transform, "miclbl", "MIC TEST", 26, TextAnchor.MiddleRight,
            new Vector2(0.5f, 0.19f), new Vector2(0.5f, 0.19f), new Vector2(-250, 0), new Vector2(420, 40));
        micLbl.color = new Color(0.9f, 0.95f, 1f);
        var micBar = NewImage(_settingsPanel.transform, "micbar", new Vector2(0.5f, 0.19f), new Vector2(0.5f, 0.19f),
            new Vector2(120, 0), new Vector2(280, 20));
        micBar.sprite = _roundedFill;
        micBar.type = Image.Type.Sliced;
        micBar.color = new Color(0.05f, 0.04f, 0.14f, 0.9f);
        _micLevelFill = NewImage(micBar.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _micLevelFill.color = new Color(0.4f, 1f, 0.75f, 0.95f);
        _micLevelFill.type = Image.Type.Filled;
        _micLevelFill.fillMethod = Image.FillMethod.Horizontal;
        _micLevelFill.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        _micLevelFill.fillAmount = 0f;
        Text micBtnLabel = null;
        var micBtn = MakeButton(_settingsPanel.transform, "START", new Vector2(0.5f, 0.19f), new Vector2(140, 44),
            new Color(0.4f, 1f, 0.75f), () => { });
        micBtn.transform.localPosition += new Vector3(350, 0, 0);
        micBtnLabel = micBtn.GetComponentInChildren<Text>();
        micBtn.onClick.AddListener(() => {
            _micTesting = !_micTesting;
            micBtnLabel.text = _micTesting ? "STOP" : "START";
            if (_micTesting) { CoopNet.MicTestStart(); _micStatus.text = "REQUESTING MIC…"; }
            else { CoopNet.MicTestStop(); _micStatus.text = ""; _micLevelFill.fillAmount = 0f; }
        });
        _micStatus = NewText(_settingsPanel.transform, "micstatus", "", 18, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.135f), new Vector2(0.5f, 0.135f), Vector2.zero, new Vector2(900, 28));
        _micStatus.color = new Color(0.4f, 1f, 0.75f, 0.9f);

        MakeButton(_settingsPanel.transform, "BACK", new Vector2(0.5f, 0.08f), new Vector2(300, 56),
            new Color(0.8f, 0.9f, 1f), () => {
                if (_micTesting) { _micTesting = false; CoopNet.MicTestStop(); micBtnLabel.text = "START"; _micStatus.text = ""; _micLevelFill.fillAmount = 0f; }
                _settingsPanel.SetActive(false);
                _homePanel.SetActive(true);
            });
        _settingsPanel.SetActive(false);
    }

    Image _micLevelFill;
    Text _micStatus;
    bool _micTesting;
    Image _sensDot;

    void Update()
    {
        // waiting indicators: sweep bars while a lobby is short on people
        if (_lobbySpin != null)
        {
            bool coopWaiting = _lobbyPanel != null && _lobbyPanel.activeSelf
                && CoopSync.I != null && !CoopSync.I.PartnerHere;
            if (_lobbySpin.activeSelf != coopWaiting) _lobbySpin.SetActive(coopWaiting);
            if (coopWaiting) _lobbySpinFill.fillAmount = Mathf.PingPong(Time.unscaledTime * 0.9f, 1f);
        }
        if (_brSpin != null)
        {
            var rs = RoyaleSync.I;
            bool brWaiting = _brLobbyPanel != null && _brLobbyPanel.activeSelf
                && rs != null && !RoyaleSync.Playing && (rs.players.Count == 0 || (rs.IsHostRole && rs.players.Count < 2));
            if (_brSpin.activeSelf != brWaiting) _brSpin.SetActive(brWaiting);
            if (brWaiting) _brSpinFill.fillAmount = Mathf.PingPong(Time.unscaledTime * 0.9f, 1f);
        }

        // co-op level-up hotkeys
        if (_sidePick != null)
        {
            if (Input.GetKeyDown(KeyCode.J)) PickSideChoice(0);
            else if (Input.GetKeyDown(KeyCode.K)) PickSideChoice(1);
            else if (Input.GetKeyDown(KeyCode.L)) PickSideChoice(2);
        }

        // sensitivity test pad: the dot moves like your in-game aim would
        if (_sensDot != null && _settingsPanel != null && _settingsPanel.activeSelf)
        {
            Vector2 p = _sensDot.rectTransform.anchoredPosition
                + new Vector2(Input.GetAxis("Mouse X"), Input.GetAxis("Mouse Y"))
                  * GameSettings.MouseSensitivity * 14f;
            p = Vector2.Lerp(p, Vector2.zero, Time.deltaTime * 1.6f);   // drift home
            p.x = Mathf.Clamp(p.x, -116f, 116f);
            p.y = Mathf.Clamp(p.y, -116f, 116f);
            _sensDot.rectTransform.anchoredPosition = p;
        }

        if (!_micTesting || _micLevelFill == null) return;
        int lvl = CoopNet.MicTestLevel();
        if (lvl == -1)
        {
            _micStatus.text = "MIC BLOCKED — CHECK BROWSER *AND* WINDOWS PRIVACY (SETTINGS > PRIVACY > MICROPHONE)";
            _micLevelFill.fillAmount = 0f;
        }
        else if (lvl == -3)
        {
            _micStatus.text = "NO MICROPHONE FOUND — PLUG IN A HEADSET AND PRESS START AGAIN";
            _micLevelFill.fillAmount = 0f;
        }
        else if (lvl == -4)
        {
            _micStatus.text = "MIC IS BUSY IN ANOTHER APP — CLOSE IT AND PRESS START AGAIN";
            _micLevelFill.fillAmount = 0f;
        }
        else if (lvl == -2)
            _micStatus.text = "REQUESTING MIC…";
        else
        {
            _micLevelFill.fillAmount = Mathf.Max(Mathf.Lerp(_micLevelFill.fillAmount, lvl / 100f, 0.4f), lvl / 100f);
            _micStatus.text = lvl > 6 ? "MIC OK — WE HEAR YOU LOUD AND CLEAR!" : "SPEAK INTO YOUR MIC…";
        }
    }

    void MakeVolumeRow(string label, float anchorY, float initial, System.Action<float> onChange, float min = 0f, float max = 1f)
    {
        var lbl = NewText(_settingsPanel.transform, "lbl-" + label, label, 26, TextAnchor.MiddleRight,
            new Vector2(0.5f, anchorY), new Vector2(0.5f, anchorY), new Vector2(-250, 0), new Vector2(420, 40));
        lbl.color = new Color(0.9f, 0.95f, 1f);

        var pct = NewText(_settingsPanel.transform, "pct-" + label, Mathf.RoundToInt(initial * 100) + "%", 22, TextAnchor.MiddleLeft,
            new Vector2(0.5f, anchorY), new Vector2(0.5f, anchorY), new Vector2(330, 0), new Vector2(90, 40));
        pct.color = new Color(1f, 0.85f, 0.4f);

        // slider: rounded track, gold fill, circle handle
        var track = new GameObject("slider-" + label);
        track.transform.SetParent(_settingsPanel.transform, false);
        var trackImg = track.AddComponent<Image>();
        trackImg.sprite = _roundedFill;
        trackImg.type = Image.Type.Sliced;
        trackImg.color = new Color(0.05f, 0.04f, 0.14f, 0.9f);
        var trt = trackImg.rectTransform;
        trt.anchorMin = trt.anchorMax = new Vector2(0.5f, anchorY);
        trt.anchoredPosition = new Vector2(120, 0);
        trt.sizeDelta = new Vector2(280, 20);

        var fillArea = new GameObject("fillArea").AddComponent<RectTransform>();
        fillArea.transform.SetParent(track.transform, false);
        fillArea.anchorMin = Vector2.zero; fillArea.anchorMax = Vector2.one;
        fillArea.offsetMin = new Vector2(4, 4); fillArea.offsetMax = new Vector2(-4, -4);
        var fill = NewImage(fillArea.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        fill.sprite = _roundedFill;
        fill.type = Image.Type.Sliced;
        fill.color = new Color(1f, 0.75f, 0.3f, 0.95f);
        fill.raycastTarget = false;

        var handleArea = new GameObject("handleArea").AddComponent<RectTransform>();
        handleArea.transform.SetParent(track.transform, false);
        handleArea.anchorMin = Vector2.zero; handleArea.anchorMax = Vector2.one;
        handleArea.offsetMin = new Vector2(10, 0); handleArea.offsetMax = new Vector2(-10, 0);
        var handle = NewImage(handleArea.transform, "handle", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(26, 26));
        handle.sprite = CircleSprite();
        handle.color = new Color(1f, 0.92f, 0.7f);
        handle.raycastTarget = true;

        var slider = track.AddComponent<Slider>();
        slider.minValue = min;
        slider.maxValue = max;
        slider.fillRect = fill.rectTransform;
        slider.handleRect = handle.rectTransform;
        slider.targetGraphic = handle;
        slider.value = initial;
        slider.onValueChanged.AddListener(v => {
            onChange(v);
            pct.text = Mathf.RoundToInt(v * 100) + "%";
            if (label.StartsWith("SFX") && Time.unscaledTime > 1f)
                GameManager.I.PlaySfx(SfxSynth.HitPulse, 0.6f);   // audible preview
        });
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
        var sub = NewText(_tourneySetupPanel.transform, "sub", "5-MINUTE SEEDED RUN + 1 MINUTE OVERTIME · +20% XP · SAME CODE = SAME WAVES & DRAFTS\nPICK YOUR PILOT — VERIFY CODE PROVES YOUR RUN AND YOUR PILOT", 20, TextAnchor.MiddleCenter,
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
        if (DiscordAuth.LoggedIn) _nameInput.text = DiscordAuth.DisplayName;

        // pilot picker: MATCH PICK keeps the seeded auto-pilot, or choose your own
        _tourneyPilotButtons.Clear();
        _tourneyPilotChoice = -1;
        for (int i = -1; i < ZealData.Pilots.Length; i++)
        {
            int choice = i;
            string label = i < 0 ? "MATCH PICK" : ZealData.Pilots[i].name.ToUpperInvariant();
            Color accent = i < 0 ? new Color(0.8f, 0.9f, 1f) : ZealData.Pilots[i].accent;
            var pb = MakeButton(_tourneySetupPanel.transform, label,
                new Vector2(0.26f + (i + 1) * 0.12f, 0.315f), new Vector2(170, 44),
                accent, () => { _tourneyPilotChoice = choice; RefreshPilotButtons(); UpdatePilotPreview(); });
            pb.GetComponentInChildren<Text>().fontSize = 18;
            _tourneyPilotButtons.Add(pb);
        }
        RefreshPilotButtons();

        _tourneyPilotPreview = NewText(_tourneySetupPanel.transform, "preview", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.255f), new Vector2(0.5f, 0.255f), Vector2.zero, new Vector2(900, 34));
        _tourneyPilotPreview.color = new Color(0.5f, 0.95f, 1f);
        _codeInput.onValueChanged.AddListener(_ => UpdatePilotPreview());
        UpdatePilotPreview();

        MakeButton(_tourneySetupPanel.transform, "START MATCH", new Vector2(0.42f, 0.18f), new Vector2(300, 56),
            new Color(0.5f, 1f, 0.6f), () => {
                TournamentMode.Arm(_codeInput.text, _nameInput.text, _tourneyPilotChoice);
                _tourneySetupPanel.SetActive(false);
                _gameHud.SetActive(true);
                GameManager.I.StartRun(TournamentMode.PilotIndex);
            });
        MakeButton(_tourneySetupPanel.transform, "BACK", new Vector2(0.58f, 0.18f), new Vector2(300, 56),
            new Color(0.8f, 0.9f, 1f), () => { _tourneySetupPanel.SetActive(false); _homePanel.SetActive(true); });
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

    void BuildCoopPanel()
    {
        _coopPanel = Panel("CoopPanel");
        var t = NewText(_coopPanel.transform, "title", "VOID CO-OP", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.8f), new Vector2(0.5f, 0.8f), Vector2.zero, new Vector2(1400, 90));
        t.color = new Color(0.4f, 1f, 0.75f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
        var sub = NewText(_coopPanel.transform, "sub", "2 PILOTS VS THE WAVES — LIVE · AGREE ON A ROOM CODE, ONE HOSTS, ONE JOINS\nVOICE CHAT ON (ALLOW YOUR MIC · N MUTES) · PICK YOUR PILOT TOGETHER IN THE LOBBY", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.705f), new Vector2(0.5f, 0.705f), Vector2.zero, new Vector2(1400, 60));
        sub.color = new Color(0.8f, 0.9f, 1f, 0.8f);

        NewText(_coopPanel.transform, "lbl1", "ROOM CODE", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.625f), new Vector2(0.5f, 0.625f), Vector2.zero, new Vector2(400, 30))
            .color = new Color(1f, 0.85f, 0.4f);
        _coopRoomInput = MakeInput(_coopPanel.transform, new Vector2(0.5f, 0.565f), "GUILD-NIGHT");
        NewText(_coopPanel.transform, "lbl2", "PILOT NAME", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.485f), new Vector2(0.5f, 0.485f), Vector2.zero, new Vector2(400, 30))
            .color = new Color(1f, 0.85f, 0.4f);
        _coopNameInput = MakeInput(_coopPanel.transform, new Vector2(0.5f, 0.425f), "YOUR CALLSIGN");
        if (DiscordAuth.LoggedIn) _coopNameInput.text = DiscordAuth.DisplayName;

        _coopStatus = NewText(_coopPanel.transform, "status", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.3f), Vector2.zero, new Vector2(1100, 34));
        _coopStatus.color = new Color(0.4f, 1f, 0.75f);

        MakeButton(_coopPanel.transform, "HOST GAME", new Vector2(0.34f, 0.185f), new Vector2(280, 56),
            new Color(0.5f, 1f, 0.6f), () => StartCoop(true));
        MakeButton(_coopPanel.transform, "JOIN GAME", new Vector2(0.5f, 0.185f), new Vector2(280, 56),
            new Color(1f, 0.85f, 0.4f), () => StartCoop(false));
        MakeButton(_coopPanel.transform, "BACK", new Vector2(0.66f, 0.185f), new Vector2(280, 56),
            new Color(0.8f, 0.9f, 1f), () => {
                CoopSync.Cancel();
                _coopStatus.text = "";
                _coopPanel.SetActive(false);
                _homePanel.SetActive(true);
            });
        _coopPanel.SetActive(false);
    }

    void StartCoop(bool host)
    {
        string room = _coopRoomInput.text;
        if (string.IsNullOrWhiteSpace(room)) { _coopStatus.text = "ENTER A ROOM CODE FIRST"; return; }
        var session = CoopSync.Begin(host, room, _coopNameInput.text, 0);
        BindCoopSession(session);
        // straight into the lobby — the partner column carries the wait state
        _coopPanel.SetActive(false);
        _lobbyPanel.SetActive(true);
        _lobbyCountdown.text = "";
        _lobbyStatus.text = host ? "SHARE THE ROOM CODE WITH YOUR PARTNER" : "";
        RefreshLobby();
    }

    // wire a co-op session's callbacks into this HUD (a fresh HUD exists
    // after every scene reload, so the surviving session re-binds here)
    void BindCoopSession(CoopSync s)
    {
        s.onStatus = msg => {
            if (_coopStatus != null) _coopStatus.text = msg;
            if (_lobbyStatus != null) _lobbyStatus.text = msg;
        };
        s.onLobby = () => {
            _coopPanel.SetActive(false);
            _homePanel.SetActive(false);
            _lobbyPanel.SetActive(true);
            _lobbyCountdown.text = "";
            RefreshLobby();
        };
        s.onLobbyChanged = RefreshLobby;
        s.onCountdown = n => {
            _lobbyCountdown.text = n > 0 ? n.ToString() : "GO!";
            if (GameManager.I != null) GameManager.I.PlaySfx(n > 0 ? SfxSynth.Pickup : SfxSynth.WaveUp, 0.8f);
        };
        s.onStarted = () => { _lobbyPanel.SetActive(false); _coopPanel.SetActive(false); };
    }

    void BuildLobbyPanel()
    {
        _lobbyPanel = Panel("LobbyPanel");
        var t = NewText(_lobbyPanel.transform, "title", "CO-OP LOBBY", 60, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.86f), new Vector2(0.5f, 0.86f), Vector2.zero, new Vector2(1200, 84));
        t.color = new Color(0.4f, 1f, 0.75f);
        t.font = _titleFont;
        _lobbyRoom = NewText(_lobbyPanel.transform, "room", "", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.78f), new Vector2(0.5f, 0.78f), Vector2.zero, new Vector2(900, 36));
        _lobbyRoom.color = new Color(1f, 0.85f, 0.4f);

        // my side
        _lobbyMyName = NewText(_lobbyPanel.transform, "myname", "YOU", 30, TextAnchor.MiddleCenter,
            new Vector2(0.3f, 0.66f), new Vector2(0.3f, 0.66f), Vector2.zero, new Vector2(500, 44));
        _lobbyMyName.color = new Color(0.5f, 0.98f, 1f);
        _lobbyMyName.font = _titleFont;
        _lobbyPilotButtons.Clear();
        for (int i = 0; i < ZealData.Pilots.Length; i++)
        {
            int idx = i;
            var pb = MakeButton(_lobbyPanel.transform, ZealData.Pilots[i].name.ToUpperInvariant(),
                new Vector2(0.165f + i * 0.09f, 0.55f), new Vector2(150, 46),
                ZealData.Pilots[i].accent, () => { if (CoopSync.I != null) CoopSync.I.SetLobbyPilot(idx); });
            pb.GetComponentInChildren<Text>().fontSize = 16;
            _lobbyPilotButtons.Add(pb);
        }
        _readyBtn = MakeButton(_lobbyPanel.transform, "READY!", new Vector2(0.3f, 0.42f), new Vector2(280, 62),
            new Color(0.5f, 1f, 0.6f), () => { if (CoopSync.I != null) CoopSync.I.SetReady(!CoopSync.I.MyReady); });

        // partner side
        _lobbyPartnerName = NewText(_lobbyPanel.transform, "pname", "…", 30, TextAnchor.MiddleCenter,
            new Vector2(0.7f, 0.66f), new Vector2(0.7f, 0.66f), Vector2.zero, new Vector2(500, 44));
        _lobbyPartnerName.color = new Color(1f, 0.55f, 0.9f);
        _lobbyPartnerName.font = _titleFont;
        _lobbyPartnerState = NewText(_lobbyPanel.transform, "pstate", "", 24, TextAnchor.MiddleCenter,
            new Vector2(0.7f, 0.52f), new Vector2(0.7f, 0.52f), Vector2.zero, new Vector2(500, 70));
        _lobbyPartnerState.color = new Color(0.85f, 0.9f, 1f);

        _lobbyCountdown = NewText(_lobbyPanel.transform, "count", "", 150, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.45f), new Vector2(0.5f, 0.45f), Vector2.zero, new Vector2(600, 190));
        _lobbyCountdown.color = new Color(1f, 0.85f, 0.4f);
        _lobbyCountdown.font = _titleFont;

        // sweep bar under the partner column while we wait for them
        var spinBg = NewImage(_lobbyPanel.transform, "spinbg", new Vector2(0.7f, 0.44f), new Vector2(0.7f, 0.44f), Vector2.zero, new Vector2(300, 8));
        spinBg.sprite = _roundedFill;
        spinBg.type = Image.Type.Sliced;
        spinBg.color = new Color(0.05f, 0.04f, 0.14f, 0.9f);
        _lobbySpinFill = NewImage(spinBg.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _lobbySpinFill.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        _lobbySpinFill.type = Image.Type.Filled;
        _lobbySpinFill.fillMethod = Image.FillMethod.Horizontal;
        _lobbySpinFill.color = new Color(0.4f, 1f, 0.75f, 0.9f);
        _lobbySpin = spinBg.gameObject;
        _lobbySpin.SetActive(false);

        _blitzBtn = MakeButton(_lobbyPanel.transform, "MODE: CAMPAIGN CO-OP", new Vector2(0.5f, 0.32f), new Vector2(560, 50),
            new Color(1f, 0.55f, 0.9f), () => {
                if (CoopSync.I == null) return;
                if (!CoopSync.IsHost) { _lobbyStatus.text = "THE HOST PICKS THE MODE"; return; }
                CoopSync.I.SetLobbyMode((CoopSync.I.lobbyMode + 1) % 3);
            });
        _blitzBtn.GetComponentInChildren<Text>().fontSize = 19;

        // duel options (host only, shown in VOID DUEL mode)
        _duelLivesBtn = MakeButton(_lobbyPanel.transform, "LIVES: 1", new Vector2(0.38f, 0.265f), new Vector2(250, 44),
            new Color(1f, 0.35f, 0.35f), () => {
                var s = CoopSync.I;
                if (s == null) return;
                if (!CoopSync.IsHost) { _lobbyStatus.text = "THE HOST SETS THE RULES"; return; }
                s.SetDuelLives(s.duelLives % 3 + 1);
            });
        _duelLivesBtn.GetComponentInChildren<Text>().fontSize = 18;
        _duelTimeBtn = MakeButton(_lobbyPanel.transform, "TIME: 2:00", new Vector2(0.62f, 0.265f), new Vector2(250, 44),
            new Color(1f, 0.35f, 0.35f), () => {
                var s = CoopSync.I;
                if (s == null) return;
                if (!CoopSync.IsHost) { _lobbyStatus.text = "THE HOST SETS THE RULES"; return; }
                s.SetDuelTime(s.duelTime == 60 ? 120 : s.duelTime == 120 ? 180 : s.duelTime == 180 ? 0 : 60);
            });
        _duelTimeBtn.GetComponentInChildren<Text>().fontSize = 18;

        _lobbyStatus = NewText(_lobbyPanel.transform, "status", "", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.24f), new Vector2(0.5f, 0.24f), Vector2.zero, new Vector2(1200, 32));
        _lobbyStatus.color = new Color(0.4f, 1f, 0.75f, 0.9f);

        MakeButton(_lobbyPanel.transform, "LEAVE", new Vector2(0.5f, 0.13f), new Vector2(280, 54),
            new Color(1f, 0.5f, 0.5f), () => {
                CoopSync.Cancel();
                _lobbyPanel.SetActive(false);
                _homePanel.SetActive(true);
            });
        _lobbyPanel.SetActive(false);
    }

    void RefreshLobby()
    {
        var s = CoopSync.I;
        if (s == null || _lobbyPanel == null) return;
        _lobbyRoom.text = "ROOM  " + s.Room + (CoopSync.IsHost ? "   ·   YOU ARE HOSTING" : "");
        _lobbyMyName.text = "YOU";
        for (int i = 0; i < _lobbyPilotButtons.Count; i++)
        {
            bool sel = i == s.MyPilot;
            _lobbyPilotButtons[i].GetComponent<Image>().color =
                sel ? new Color(0.22f, 0.18f, 0.42f, 0.95f) : new Color(0.09f, 0.07f, 0.2f, 0.72f);
            var border = _lobbyPilotButtons[i].transform.Find("border").GetComponent<Image>();
            border.color = new Color(border.color.r, border.color.g, border.color.b, sel ? 1f : 0.25f);
        }
        var readyLabel = _readyBtn.GetComponentInChildren<Text>();
        readyLabel.text = s.MyReady ? "UNREADY" : "READY!";
        readyLabel.color = s.MyReady ? new Color(1f, 0.85f, 0.4f) : new Color(0.5f, 1f, 0.6f);

        var modeLabel = _blitzBtn.GetComponentInChildren<Text>();
        modeLabel.text = s.lobbyMode == 1 ? "MODE: BLITZ DUO — 5:00 + OT · SEEDED · TEAM SCORE"
            : s.lobbyMode == 2 ? "MODE: VOID DUEL — 1V1 PVP"
            : "MODE: CAMPAIGN CO-OP — ENDLESS WAVES";
        modeLabel.color = s.lobbyMode == 1 ? new Color(1f, 0.55f, 0.9f)
            : s.lobbyMode == 2 ? new Color(1f, 0.35f, 0.35f)
            : new Color(0.5f, 0.98f, 1f);

        bool duelMode = s.lobbyMode == 2;
        _duelLivesBtn.gameObject.SetActive(duelMode);
        _duelTimeBtn.gameObject.SetActive(duelMode);
        if (duelMode)
        {
            _duelLivesBtn.GetComponentInChildren<Text>().text =
                "LIVES: " + s.duelLives + (s.duelLives == 1 ? " (SUDDEN DEATH)" : "");
            _duelTimeBtn.GetComponentInChildren<Text>().text = s.duelTime == 0
                ? "TIME: UNLIMITED"
                : "TIME: " + (s.duelTime / 60) + ":00 (HITS TIEBREAK)";
        }

        if (!s.PartnerHere)
        {
            _lobbyPartnerName.text = "…";
            _lobbyPartnerState.text = CoopSync.IsHost
                ? "WAITING FOR A PARTNER TO JOIN"
                : (s.Connected ? "SYNCING WITH THE HOST" : "CONNECTING TO THE HOST");
        }
        else
        {
            _lobbyPartnerName.text = s.PartnerName.ToUpperInvariant();
            string pilot = s.partnerLobbyPilot >= 0 && s.partnerLobbyPilot < ZealData.Pilots.Length
                ? ZealData.Pilots[s.partnerLobbyPilot].name.ToUpperInvariant() : "PICKING…";
            _lobbyPartnerState.text = pilot + "\n" + (s.partnerReady ? "READY ✓" : "NOT READY");
            _lobbyPartnerState.color = s.partnerReady ? new Color(0.5f, 1f, 0.6f) : new Color(0.85f, 0.9f, 1f);
        }
    }

    void RefreshPilotButtons()
    {
        for (int i = 0; i < _tourneyPilotButtons.Count; i++)
        {
            bool selected = (i - 1) == _tourneyPilotChoice;   // slot 0 = MATCH PICK (-1)
            var bg = _tourneyPilotButtons[i].GetComponent<Image>();
            bg.color = selected ? new Color(0.22f, 0.18f, 0.42f, 0.95f) : new Color(0.09f, 0.07f, 0.2f, 0.72f);
            var border = _tourneyPilotButtons[i].transform.Find("border").GetComponent<Image>();
            border.color = new Color(border.color.r, border.color.g, border.color.b, selected ? 1f : 0.25f);
        }
    }

    void UpdatePilotPreview()
    {
        if (_tourneyPilotChoice >= 0)
        {
            var chosen = ZealData.Pilots[_tourneyPilotChoice];
            _tourneyPilotPreview.text = "YOUR PILOT:  " + chosen.name.ToUpperInvariant() + " — " + chosen.title.ToUpperInvariant();
            _tourneyPilotPreview.color = chosen.accent;
            return;
        }
        string code = string.IsNullOrEmpty(_codeInput.text) ? "OPEN" : _codeInput.text.Trim().ToUpperInvariant();
        var pilot = ZealData.Pilots[(int)(TournamentMode.Hash32(code) % (uint)ZealData.Pilots.Length)];
        _tourneyPilotPreview.text = "MATCH PILOT:  " + pilot.name.ToUpperInvariant() + " — " + pilot.title.ToUpperInvariant();
        _tourneyPilotPreview.color = new Color(0.5f, 0.95f, 1f);
    }

    Button MakeButton(Transform parent, string label, Vector2 anchor, Vector2 size, Color color, UnityEngine.Events.UnityAction onClick)
    {
        var go = new GameObject("btn-" + label);
        go.transform.SetParent(parent, false);
        var img = go.AddComponent<Image>();
        img.sprite = _roundedFill;
        img.type = Image.Type.Sliced;
        img.color = new Color(0.09f, 0.07f, 0.2f, 0.72f);
        var rt = img.rectTransform;
        rt.anchorMin = rt.anchorMax = anchor;
        rt.sizeDelta = size;
        var btn = go.AddComponent<Button>();
        var colors = btn.colors;
        colors.highlightedColor = new Color(1.6f, 1.6f, 1.9f);
        colors.pressedColor = new Color(2f, 2f, 2.4f);
        btn.colors = colors;
        btn.onClick.AddListener(onClick);
        var btnGlow = NewImage(go.transform, "border", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        btnGlow.sprite = _roundedOutline;
        btnGlow.type = Image.Type.Sliced;
        btnGlow.color = new Color(color.r, color.g, color.b, 0.6f);
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

    // ---------- battle royale panels ----------
    void BuildRoyalePanels()
    {
        // setup: room / callsign / pilot / host-join-watch
        _brPanel = Panel("RoyalePanel");
        var t = NewText(_brPanel.transform, "title", "BATTLE ROYALE", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.8f), new Vector2(0.5f, 0.8f), Vector2.zero, new Vector2(1400, 90));
        t.color = new Color(1f, 0.35f, 0.35f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
        var sub = NewText(_brPanel.transform, "sub", "UP TO 8 PILOTS · SHRINKING VOID ZONE · LAST SHIP FLYING WINS\nONE HOSTS, EVERYONE ELSE JOINS — OR PRESS WATCH TO SPECTATE", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.705f), new Vector2(0.5f, 0.705f), Vector2.zero, new Vector2(1400, 60));
        sub.color = new Color(0.8f, 0.9f, 1f, 0.8f);

        NewText(_brPanel.transform, "lbl1", "ROOM CODE", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.625f), new Vector2(0.5f, 0.625f), Vector2.zero, new Vector2(400, 30))
            .color = new Color(1f, 0.85f, 0.4f);
        _brRoomInput = MakeInput(_brPanel.transform, new Vector2(0.5f, 0.565f), "ROYALE-NIGHT");
        NewText(_brPanel.transform, "lbl2", "PILOT NAME", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.485f), new Vector2(0.5f, 0.485f), Vector2.zero, new Vector2(400, 30))
            .color = new Color(1f, 0.85f, 0.4f);
        _brNameInput = MakeInput(_brPanel.transform, new Vector2(0.5f, 0.425f), "YOUR CALLSIGN");
        if (DiscordAuth.LoggedIn) _brNameInput.text = DiscordAuth.DisplayName;

        _brPilotButtons.Clear();
        _brPilotChoice = 0;
        for (int i = 0; i < ZealData.Pilots.Length; i++)
        {
            int idx = i;
            var pb = MakeButton(_brPanel.transform, ZealData.Pilots[i].name.ToUpperInvariant(),
                new Vector2(0.32f + i * 0.12f, 0.345f), new Vector2(170, 44),
                ZealData.Pilots[i].accent, () => {
                    _brPilotChoice = idx;
                    if (RoyaleSync.I != null) RoyaleSync.I.SetLobbyPilot(idx);
                    RefreshBrPilotButtons();
                });
            pb.GetComponentInChildren<Text>().fontSize = 18;
            _brPilotButtons.Add(pb);
        }
        RefreshBrPilotButtons();

        _brStatus = NewText(_brPanel.transform, "status", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.275f), new Vector2(0.5f, 0.275f), Vector2.zero, new Vector2(1100, 34));
        _brStatus.color = new Color(1f, 0.55f, 0.5f);

        MakeButton(_brPanel.transform, "HOST GAME", new Vector2(0.29f, 0.185f), new Vector2(250, 56),
            new Color(0.5f, 1f, 0.6f), () => StartRoyale(true, false));
        MakeButton(_brPanel.transform, "JOIN GAME", new Vector2(0.43f, 0.185f), new Vector2(250, 56),
            new Color(1f, 0.85f, 0.4f), () => StartRoyale(false, false));
        MakeButton(_brPanel.transform, "WATCH", new Vector2(0.57f, 0.185f), new Vector2(250, 56),
            new Color(0.6f, 0.9f, 1f), () => StartRoyale(false, true));
        MakeButton(_brPanel.transform, "BACK", new Vector2(0.71f, 0.185f), new Vector2(250, 56),
            new Color(0.8f, 0.9f, 1f), () => {
                RoyaleSync.Cancel();
                _brStatus.text = "";
                _brPanel.SetActive(false);
                _homePanel.SetActive(true);
            });
        _brPanel.SetActive(false);

        // lobby: roster + start
        _brLobbyPanel = Panel("RoyaleLobby");
        var lt = NewText(_brLobbyPanel.transform, "title", "ROYALE LOBBY", 60, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.87f), new Vector2(0.5f, 0.87f), Vector2.zero, new Vector2(1200, 84));
        lt.color = new Color(1f, 0.35f, 0.35f);
        lt.font = _titleFont;
        _brLobbyRoom = NewText(_brLobbyPanel.transform, "room", "", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.79f), new Vector2(0.5f, 0.79f), Vector2.zero, new Vector2(900, 36));
        _brLobbyRoom.color = new Color(1f, 0.85f, 0.4f);
        _brRoster = NewText(_brLobbyPanel.transform, "roster", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.335f), new Vector2(0.5f, 0.335f), Vector2.zero, new Vector2(800, 34));
        _brRoster.color = new Color(0.85f, 0.9f, 1f);

        // squad picker: FFA, or teams A-D (two duos = 2v2; comms are team-only)
        _brTeamBtn = MakeButton(_brLobbyPanel.transform, "TEAM: FFA (EVERY SHIP FOR ITSELF)", new Vector2(0.5f, 0.275f), new Vector2(520, 46),
            new Color(0.4f, 1f, 0.75f), () => {
                var s = RoyaleSync.I;
                if (s == null || s.MyInfo == null) return;
                s.SetTeam((s.MyInfo.team + 1) % 5);
                RefreshRoyaleLobby();
            });
        _brTeamBtn.GetComponentInChildren<Text>().fontSize = 18;

        // one row per possible pilot: name text + a host-only KICK button
        _brRowTexts.Clear();
        _brRowKicks.Clear();
        for (int i = 0; i < 8; i++)
        {
            float y = 0.72f - i * 0.048f;
            var rowText = NewText(_brLobbyPanel.transform, "brrow" + i, "", 24, TextAnchor.MiddleCenter,
                new Vector2(0.5f, y), new Vector2(0.5f, y), Vector2.zero, new Vector2(640, 34));
            rowText.color = new Color(0.85f, 0.9f, 1f);
            int rowIdx = i;
            var kick = MakeButton(_brLobbyPanel.transform, "KICK", new Vector2(0.5f, y), new Vector2(90, 34),
                new Color(1f, 0.4f, 0.4f), () => {
                    if (RoyaleSync.I != null && rowIdx < RoyaleSync.I.players.Count)
                        RoyaleSync.I.HostKick(RoyaleSync.I.players[rowIdx].slot);
                });
            kick.transform.localPosition += new Vector3(400f, 0f, 0f);
            kick.GetComponentInChildren<Text>().fontSize = 16;
            kick.gameObject.SetActive(false);
            rowText.gameObject.SetActive(false);
            _brRowTexts.Add(rowText);
            _brRowKicks.Add(kick);
        }
        _brCountdown = NewText(_brLobbyPanel.transform, "count", "", 150, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.45f), new Vector2(0.5f, 0.45f), Vector2.zero, new Vector2(600, 190));
        _brCountdown.color = new Color(1f, 0.85f, 0.4f);
        _brCountdown.font = _titleFont;
        _brLobbyStatus = NewText(_brLobbyPanel.transform, "status", "", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.222f), new Vector2(0.5f, 0.222f), Vector2.zero, new Vector2(1200, 32));
        _brLobbyStatus.color = new Color(1f, 0.55f, 0.5f);

        var brSpinBg = NewImage(_brLobbyPanel.transform, "spinbg", new Vector2(0.5f, 0.196f), new Vector2(0.5f, 0.196f), Vector2.zero, new Vector2(340, 8));
        brSpinBg.sprite = _roundedFill;
        brSpinBg.type = Image.Type.Sliced;
        brSpinBg.color = new Color(0.05f, 0.04f, 0.14f, 0.9f);
        _brSpinFill = NewImage(brSpinBg.transform, "fill", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        _brSpinFill.sprite = Sprite.Create(Texture2D.whiteTexture, new Rect(0, 0, 4, 4), new Vector2(0.5f, 0.5f));
        _brSpinFill.type = Image.Type.Filled;
        _brSpinFill.fillMethod = Image.FillMethod.Horizontal;
        _brSpinFill.color = new Color(1f, 0.35f, 0.35f, 0.9f);
        _brSpin = brSpinBg.gameObject;
        _brSpin.SetActive(false);
        _brStartBtn = MakeButton(_brLobbyPanel.transform, "LAUNCH MATCH", new Vector2(0.38f, 0.15f), new Vector2(300, 58),
            new Color(0.5f, 1f, 0.6f), () => { if (RoyaleSync.I != null) RoyaleSync.I.HostStartMatch(); });
        MakeButton(_brLobbyPanel.transform, "LEAVE", new Vector2(0.62f, 0.15f), new Vector2(300, 58),
            new Color(1f, 0.5f, 0.5f), () => {
                RoyaleSync.Cancel();
                _brLobbyPanel.SetActive(false);
                _homePanel.SetActive(true);
            });
        _brLobbyPanel.SetActive(false);
    }

    void RefreshBrPilotButtons()
    {
        for (int i = 0; i < _brPilotButtons.Count; i++)
        {
            bool sel = i == _brPilotChoice;
            _brPilotButtons[i].GetComponent<Image>().color =
                sel ? new Color(0.22f, 0.18f, 0.42f, 0.95f) : new Color(0.09f, 0.07f, 0.2f, 0.72f);
            var border = _brPilotButtons[i].transform.Find("border").GetComponent<Image>();
            border.color = new Color(border.color.r, border.color.g, border.color.b, sel ? 1f : 0.25f);
        }
    }

    void StartRoyale(bool host, bool spectate)
    {
        string room = _brRoomInput.text;
        if (string.IsNullOrWhiteSpace(room)) { _brStatus.text = "ENTER A ROOM CODE FIRST"; return; }
        var s = RoyaleSync.Begin(host, room, _brNameInput.text, _brPilotChoice, spectate);
        BindRoyaleSession(s);
        // everyone lands in the lobby immediately; the sweep bar shows the wait
        _brPanel.SetActive(false);
        _brLobbyPanel.SetActive(true);
        _brCountdown.text = "";
        _brLobbyStatus.text = host
            ? "SHARE THE ROOM CODE — WAITING FOR PILOTS"
            : (spectate ? "CONNECTING TO " + room.Trim().ToUpperInvariant() + " AS A SPECTATOR"
                        : "CONNECTING TO " + room.Trim().ToUpperInvariant());
        RefreshRoyaleLobby();
    }

    void BindRoyaleSession(RoyaleSync s)
    {
        s.onStatus = msg => {
            if (_brStatus != null) _brStatus.text = msg;
            if (_brLobbyStatus != null) _brLobbyStatus.text = msg;
        };
        s.onLobby = () => {
            _brPanel.SetActive(false);
            _homePanel.SetActive(false);
            _brLobbyPanel.SetActive(true);
            _brCountdown.text = "";
            RefreshRoyaleLobby();
        };
        s.onRosterChanged = RefreshRoyaleLobby;
        s.onCountdown = n => {
            _brCountdown.text = n > 0 ? n.ToString() : "FIGHT!";
            if (GameManager.I != null) GameManager.I.PlaySfx(n > 0 ? SfxSynth.Pickup : SfxSynth.WaveUp, 0.8f);
        };
        s.onStarted = () => { _brLobbyPanel.SetActive(false); _brPanel.SetActive(false); };
        s.onKicked = () => {
            _brLobbyPanel.SetActive(false);
            _brPanel.SetActive(true);
            _brStatus.text = "KICKED BY THE HOST";
        };
    }

    void RefreshRoyaleLobby()
    {
        var s = RoyaleSync.I;
        if (s == null || _brLobbyPanel == null) return;
        _brLobbyRoom.text = "ROOM  " + s.Room + (s.IsHostRole ? "   ·   YOU ARE HOSTING" : "");
        for (int i = 0; i < _brRowTexts.Count; i++)
        {
            bool has = i < s.players.Count;
            _brRowTexts[i].gameObject.SetActive(has);
            if (!has) { _brRowKicks[i].gameObject.SetActive(false); continue; }
            var p = s.players[i];
            string pilot = ZealData.Pilots[Mathf.Clamp(p.pilot, 0, ZealData.Pilots.Length - 1)].name.ToUpperInvariant();
            string team = p.team > 0 ? "  [" + (char)('A' + p.team - 1) + "]" : "";
            _brRowTexts[i].text = (p.slot == s.mySlot ? "> " : "") + p.name.ToUpperInvariant() + "  —  " + pilot + team + (p.slot == 0 ? "  (HOST)" : "");
            _brRowTexts[i].color = p.slot == s.mySlot ? new Color(0.5f, 0.98f, 1f) : new Color(0.85f, 0.9f, 1f);
            _brRowKicks[i].gameObject.SetActive(s.IsHostRole && p.slot != 0);
        }
        if (s.MyInfo != null)
        {
            var teamLabel = _brTeamBtn.GetComponentInChildren<Text>();
            teamLabel.text = s.MyInfo.team > 0
                ? "TEAM: " + (char)('A' + s.MyInfo.team - 1) + " — SQUAD COMMS ONLY"
                : "TEAM: FFA (EVERY SHIP FOR ITSELF)";
            _brTeamBtn.gameObject.SetActive(s.mySlot >= 0);
        }
        else _brTeamBtn.gameObject.SetActive(false);
        _brRoster.text = s.players.Count == 0
            ? "CONNECTING…"
            : s.players.Count + " / 8 PILOTS"
                + (s.spectatorCount > 0 ? "   ·   " + s.spectatorCount + " WATCHING" : "")
                + (s.mySlot < 0 ? "   ·   YOU ARE SPECTATING" : "");
        _brStartBtn.gameObject.SetActive(s.IsHostRole);
    }

    public void ShowRoyaleEnd(bool won, string winnerName, int placement, bool spectator)
    {
        _gameHud.SetActive(false);
        if (_sideLevelPanel != null) _sideLevelPanel.SetActive(false);
        _warnBorder.color = new Color(1, 1, 1, 0);
        string winner = winnerName.ToUpperInvariant();
        string board = "";
        if (RoyaleSync.I != null && RoyaleSync.I.lastMatchStats.Count > 0)
            board = "\n" + string.Join("\n", RoyaleSync.I.lastMatchStats);   // ★ = match MVP
        if (won)
        {
            _winPanel.SetActive(true);
            _winTitle.text = "LAST SHIP FLYING!";
            _winSub.text = "THE VOID IS YOURS";
            _winScore.text = "";
            _winBest.text = board.TrimStart('\n');
        }
        else
        {
            _overPanel.SetActive(true);
            _overTitle.text = spectator ? "MATCH OVER" : "ELIMINATED";
            _overScore.text = "";
            _overBest.text = "WINNER:  " + winner;
            _overStats.text = (spectator ? "" : (placement > 0 ? "YOU PLACED #" + placement : "")) + board;
            _overPulse.text = "CLICK TO RETURN TO LOBBY";
        }
        Invoke(nameof(EnableRestart), 1.2f);
    }

    // timed duel: 0 = won on hits, 1 = lost on hits, 2 = draw
    public void ShowDuelTimedEnd(int outcome, int myHits, int theirHits, string partnerName)
    {
        _gameHud.SetActive(false);
        if (_sideLevelPanel != null) _sideLevelPanel.SetActive(false);
        _warnBorder.color = new Color(1, 1, 1, 0);
        string partner = partnerName.ToUpperInvariant();
        string hits = "HITS — YOU " + myHits + "  /  " + partner + " " + theirHits;
        if (outcome == 0)
        {
            _winPanel.SetActive(true);
            _winTitle.text = "DUEL WON ON HITS!";
            _winSub.text = hits;
            _winScore.text = "";
            _winBest.text = "";
        }
        else
        {
            _overPanel.SetActive(true);
            _overTitle.text = outcome == 2 ? "DRAW" : "DUEL LOST ON HITS";
            _overScore.text = "";
            _overBest.text = "";
            _overStats.text = hits;
            _overPulse.text = "CLICK TO RETURN TO LOBBY";
        }
        Invoke(nameof(EnableRestart), 1.2f);
    }

    // co-op level-ups: no pause — a compact card stack on the right, J/K/L to pick
    void BuildSideLevelPanel()
    {
        _sideLevelPanel = new GameObject("SideLevelPanel");
        _sideLevelPanel.transform.SetParent(_canvas.transform, false);
        var rt = _sideLevelPanel.AddComponent<RectTransform>();
        rt.anchorMin = rt.anchorMax = new Vector2(1f, 0.5f);
        rt.anchoredPosition = new Vector2(-180, 0);
        rt.sizeDelta = new Vector2(330, 560);
        _sideLevelPanel.SetActive(false);
    }

    public void ShowLevelUpSide(int level, List<LevelUpChoices> choices, System.Action<LevelUpChoices> onPick)
    {
        foreach (var c in _sideCards) Destroy(c);
        _sideCards.Clear();
        _sideChoices = choices;
        _sidePick = onPick;
        _sideLevelPanel.SetActive(true);

        var title = NewText(_sideLevelPanel.transform, "title", "LEVEL " + level + " — PICK!", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 1f), new Vector2(0.5f, 1f), new Vector2(0, -20), new Vector2(330, 40));
        title.color = new Color(0.4f, 0.95f, 1f);
        title.font = _titleFont;
        _sideCards.Add(title.gameObject);

        string[] keys = { "J", "K", "L" };
        for (int i = 0; i < choices.Count && i < 3; i++)
        {
            var choice = choices[i];
            var card = new GameObject("side" + i);
            card.transform.SetParent(_sideLevelPanel.transform, false);
            var img = card.AddComponent<Image>();
            img.sprite = _roundedFill;
            img.type = Image.Type.Sliced;
            img.color = new Color(0.07f, 0.05f, 0.16f, 0.82f);
            var crt = img.rectTransform;
            crt.anchorMin = crt.anchorMax = new Vector2(0.5f, 1f);
            crt.anchoredPosition = new Vector2(0, -110 - i * 150);
            crt.sizeDelta = new Vector2(320, 140);
            var glow = NewImage(card.transform, "border", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
            glow.sprite = _roundedOutline;
            glow.type = Image.Type.Sliced;
            glow.color = new Color(1f, 0.85f, 0.4f, 0.7f);

            var key = NewText(card.transform, "key", "[" + keys[i] + "]", 30, TextAnchor.MiddleCenter,
                new Vector2(0.12f, 0.5f), new Vector2(0.12f, 0.5f), Vector2.zero, new Vector2(60, 44));
            key.color = new Color(0.4f, 1f, 0.75f);
            key.fontStyle = FontStyle.Bold;

            if (choice.sprite != null)
            {
                var icon = NewImage(card.transform, "icon", new Vector2(0.32f, 0.5f), new Vector2(0.32f, 0.5f), Vector2.zero, new Vector2(60, 60));
                icon.sprite = choice.sprite;
                icon.preserveAspect = true;
            }
            var nm = NewText(card.transform, "name", choice.title, 19, TextAnchor.MiddleLeft,
                new Vector2(0.45f, 0.72f), new Vector2(0.45f, 0.72f), new Vector2(80, 0), new Vector2(190, 44));
            nm.color = new Color(1f, 0.85f, 0.4f);
            nm.fontStyle = FontStyle.Bold;
            var ds = NewText(card.transform, "desc", choice.desc, 14, TextAnchor.MiddleLeft,
                new Vector2(0.45f, 0.32f), new Vector2(0.45f, 0.32f), new Vector2(80, 0), new Vector2(190, 70));
            ds.color = new Color(0.85f, 0.9f, 1f, 0.9f);
            _sideCards.Add(card);
        }
    }

    void PickSideChoice(int i)
    {
        if (_sideChoices == null || i >= _sideChoices.Count) return;
        var choice = _sideChoices[i];
        var cb = _sidePick;
        _sideChoices = null;
        _sidePick = null;
        foreach (var c in _sideCards) Destroy(c);
        _sideCards.Clear();
        _sideLevelPanel.SetActive(false);
        cb?.Invoke(choice);
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

    Text _overTitle, _winTitle, _winSub;

    void BuildOverPanel()
    {
        _overPanel = Panel("OverPanel");
        _overTitle = NewText(_overPanel.transform, "title", "SHIP DESTROYED", 84, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(1600, 110));
        _overTitle.color = new Color(1f, 0.35f, 0.5f);
        _overTitle.fontStyle = FontStyle.BoldAndItalic;
        _overTitle.font = _titleFont;
        _overScore = NewText(_overPanel.transform, "score", "0", 90, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1200, 120));
        _overScore.color = new Color(0.5f, 0.95f, 1f);
        _overScore.fontStyle = FontStyle.Bold;
        _overBest = NewText(_overPanel.transform, "best", "", 30, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.38f), new Vector2(0.5f, 0.38f), Vector2.zero, new Vector2(1200, 50));
        _overBest.color = new Color(1f, 0.85f, 0.4f);
        _overStats = NewText(_overPanel.transform, "stats", "", 24, TextAnchor.UpperCenter,
            new Vector2(0.5f, 0.33f), new Vector2(0.5f, 0.33f), Vector2.zero, new Vector2(1200, 40));
        _overStats.color = new Color(0.8f, 0.9f, 1f, 0.8f);
        _overStats.verticalOverflow = VerticalWrapMode.Overflow;   // scoreboards run long
        _overPulse = NewText(_overPanel.transform, "pulse", "CLICK TO RELAUNCH", 34, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.18f), new Vector2(0.5f, 0.18f), Vector2.zero, new Vector2(800, 60));
        _overPulse.color = new Color(1f, 0.85f, 0.4f);
        _overPulse.fontStyle = FontStyle.Bold;
        _overPanel.SetActive(false);
    }

    void BuildWinPanel()
    {
        _winPanel = Panel("WinPanel");
        _winTitle = NewText(_winPanel.transform, "title", "SECTOR CLEARED", 92, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.68f), new Vector2(0.5f, 0.68f), Vector2.zero, new Vector2(1600, 120));
        _winTitle.color = new Color(0.5f, 1f, 0.6f);
        _winTitle.fontStyle = FontStyle.BoldAndItalic;
        _winTitle.font = _titleFont;
        _winSub = NewText(_winPanel.transform, "sub", "THE VOID DREADNOUGHT IS DUST", 30, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.59f), new Vector2(0.5f, 0.59f), Vector2.zero, new Vector2(1400, 50));
        _winSub.color = new Color(1f, 0.55f, 0.9f);
        _winScore = NewText(_winPanel.transform, "score", "0", 90, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.47f), new Vector2(0.5f, 0.47f), Vector2.zero, new Vector2(1200, 120));
        _winScore.color = new Color(0.5f, 0.95f, 1f);
        _winScore.fontStyle = FontStyle.Bold;
        _winBest = NewText(_winPanel.transform, "best", "", 30, TextAnchor.UpperCenter,
            new Vector2(0.5f, 0.38f), new Vector2(0.5f, 0.38f), Vector2.zero, new Vector2(1200, 50));
        _winBest.color = new Color(1f, 0.85f, 0.4f);
        _winBest.verticalOverflow = VerticalWrapMode.Overflow;
        var p = NewText(_winPanel.transform, "pulse", "CLICK TO FLY AGAIN", 34, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.2f), new Vector2(0.5f, 0.2f), Vector2.zero, new Vector2(800, 60));
        p.color = new Color(1f, 0.85f, 0.4f);
        p.fontStyle = FontStyle.Bold;
        _winPanel.SetActive(false);
    }

    // ---------- public API ----------
    public void ShowStart()
    {
        // a royale session that survived the scene reload goes straight back to its lobby
        if (RoyaleSync.Active && RoyaleSync.I != null && RoyaleSync.I.InLobby)
        {
            BindRoyaleSession(RoyaleSync.I);
            _brLobbyPanel.SetActive(true);
            _brCountdown.text = "";
            RefreshRoyaleLobby();
            WantsStart = true;
            return;
        }
        // a co-op session that survived the scene reload goes straight back to its lobby
        if (CoopSync.Active && CoopSync.I != null && CoopSync.I.InLobby)
        {
            BindCoopSession(CoopSync.I);
            _lobbyPanel.SetActive(true);
            _lobbyCountdown.text = "";
            RefreshLobby();
            WantsStart = true;
            return;
        }
        _homePanel.SetActive(true);
        _bestHomeText.text = GameManager.I != null && GameManager.I.best > 0 ? "BEST  " + GameManager.I.best.ToString("N0") : "";
        WantsStart = true;
    }
    public void ShowGameHud() { WantsStart = false; _startPanel.SetActive(false); _gameHud.SetActive(true); }

    public void ShowGameOver(int score, int best, bool newBest, int wave)
    {
        _gameHud.SetActive(false);
        if (_sideLevelPanel != null) _sideLevelPanel.SetActive(false);
        _overPanel.SetActive(true);
        _overTitle.text = "SHIP DESTROYED";
        _overPulse.text = CoopSync.Active ? "CLICK TO RETURN TO LOBBY" : "CLICK TO RELAUNCH";
        _warnBorder.color = new Color(1, 1, 1, 0);
        _overScore.text = score.ToString("N0");
        _overBest.text = newBest ? "NEW BEST!" : "BEST  " + best.ToString("N0");
        _overStats.text = wave > WaveDirector.FinalWave
            ? "Survived to wave " + wave + " — sector cleared"
            : "Reached wave " + wave + " / " + WaveDirector.FinalWave;
        if (CoopSync.Active && CoopSync.I != null && !CoopSync.DuelActive)
            _overStats.text += "\n" + CoopSync.I.MvpLine();
        Invoke(nameof(EnableRestart), 1.2f);
    }
    void EnableRestart() { WantsRestart = true; }

    public void ShowVictory(int score, int best, bool newBest)
    {
        _gameHud.SetActive(false);
        _winPanel.SetActive(true);
        _winTitle.text = "SECTOR CLEARED";
        _winSub.text = "THE VOID DREADNOUGHT IS DUST";
        _warnBorder.color = new Color(1, 1, 1, 0);
        _winScore.text = score.ToString("N0");
        _winBest.text = newBest ? "NEW BEST!" : "BEST  " + best.ToString("N0");
        Invoke(nameof(EnableRestart), 1.5f);
    }

    public void ShowDuelEnd(bool won, string partnerName)
    {
        _gameHud.SetActive(false);
        if (_sideLevelPanel != null) _sideLevelPanel.SetActive(false);
        _warnBorder.color = new Color(1, 1, 1, 0);
        string partner = partnerName.ToUpperInvariant();
        if (won)
        {
            _winPanel.SetActive(true);
            _winTitle.text = "DUEL WON!";
            _winSub.text = partner + " IS SPACE DUST";
            _winScore.text = "";
            _winBest.text = "";
        }
        else
        {
            _overPanel.SetActive(true);
            _overTitle.text = "DUEL LOST";
            _overScore.text = "";
            _overBest.text = "";
            _overStats.text = partner + " RULES THE VOID... FOR NOW";
            _overPulse.text = "CLICK TO RETURN TO LOBBY";
        }
        Invoke(nameof(EnableRestart), 1.2f);
    }

    public void Tick(Health player, WaveDirector waves, int score)
    {
        _wavesRef = waves;
        _scoreText.text = score.ToString("N0");
        _waveText.text = waves.wave > WaveDirector.FinalWave
            ? "SURVIVAL " + waves.wave
            : "WAVE " + Mathf.Max(1, waves.wave) + " / " + WaveDirector.FinalWave;
        _hostilesText.text = waves.hostilesAlive > 0 ? waves.hostilesAlive + " HOSTILE" + (waves.hostilesAlive > 1 ? "S" : "") : "";

        // battle royale readouts: ships left + zone countdown
        if (RoyaleSync.Active && RoyaleSync.Playing && RoyaleSync.I != null)
        {
            _hostilesText.text = RoyaleSync.I.aliveCount + " SHIPS LEFT";
            _waveText.text = "BATTLE ROYALE";
            _timerText.text = "ZONE " + Mathf.CeilToInt(RoyaleSync.I.ZoneShrinkIn) + "s";
            _timerText.color = new Color(1f, 0.4f, 0.4f);
        }
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
                if (spc.PilotId != _skillIconFor)
                {
                    _skillIconFor = spc.PilotId;
                    var specialArt = SkillIcons.Special(spc.PilotId);   // hand-drawn art first
                    _skillIconImg.sprite = specialArt != null ? specialArt : SkillIconSprite(spc.PilotId);
                }
                bool ready = spc.cooldownLeft <= 0f;
                _skillFill.fillAmount = spc.CooldownTotal > 0f ? 1f - spc.cooldownLeft / spc.CooldownTotal : 1f;
                _skillFill.color = ready
                    ? new Color(1f, 0.85f, 0.4f, 0.3f)
                    : new Color(0.2f, 0.3f, 0.5f, 0.55f);
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

        // live sidebar: tournament standings and/or the co-op damage race
        {
            var sb = new System.Text.StringBuilder();
            if (TournamentMode.Active && TournamentNet.I != null && TournamentNet.I.online && TournamentNet.I.latest.Length > 0)
            {
                sb.AppendLine("LIVE — " + TournamentMode.MatchCode);
                int shown = 0;
                foreach (var e in TournamentNet.I.latest)
                {
                    shown++;
                    bool me = e.name == TournamentMode.PlayerName;
                    sb.AppendLine((me ? "> " : "") + shown + ". " + e.name + "  " + e.score.ToString("N0"));
                    if (shown >= 5) break;
                }
            }
            if (CoopSync.Active && CoopSync.I != null && !CoopSync.DuelActive)
            {
                var cs = CoopSync.I;
                bool meLead = cs.myDamage >= cs.partnerDamage;
                sb.AppendLine("DAMAGE DEALT");
                sb.AppendLine((meLead ? "★ " : "   ") + "YOU  " + Mathf.RoundToInt(cs.myDamage).ToString("N0"));
                sb.AppendLine((meLead ? "   " : "★ ") + cs.PartnerName.ToUpperInvariant() + "  " + Mathf.RoundToInt(cs.partnerDamage).ToString("N0"));
            }
            else if (CoopSync.DuelActive && CoopSync.I != null)
            {
                var cs = CoopSync.I;
                sb.AppendLine("HITS LANDED");
                sb.AppendLine("YOU  " + cs.partnerHitsTaken);
                sb.AppendLine(cs.PartnerName.ToUpperInvariant() + "  " + cs.hitsTaken);
            }
            _liveBoardText.text = sb.ToString();
        }

        UpdateIndicators(player);
        UpdateWorldBars(player);

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

        PollIdentity();   // wallet connect resolves async — refresh the corner when state flips

        // banner fade
        if (_bannerTimer > 0f)
        {
            _bannerTimer -= Time.deltaTime;
            float a = Mathf.Clamp01(_bannerTimer / 0.6f);
            float ain = Mathf.Clamp01((2.2f - _bannerTimer) / 0.25f);
            _bannerText.color = new Color(1f, 0.4f, 0.85f, Mathf.Min(a, ain));
        }

        // announcer caption fade
        if (_announceTimer > 0f)
        {
            _announceTimer -= Time.deltaTime;
            float a = Mathf.Clamp01(_announceTimer / 0.5f);
            float ain = Mathf.Clamp01((2.6f - _announceTimer) / 0.2f);
            _announceText.color = new Color(0.55f, 0.95f, 1f, Mathf.Min(a, ain));
        }

        // vignette decay
        _vignetteAlpha = Mathf.Max(0f, _vignetteAlpha - Time.deltaTime * 2.2f);
        _vignette.color = new Color(1, 1, 1, _vignetteAlpha);
    }

    public void SetCombo(int mult) { _comboText.text = mult >= 2 ? "COMBO x" + mult : ""; }
    public void WaveBanner(string msg) { _bannerText.text = msg; _bannerTimer = 2.2f; }
    public void AnnounceCaption(string msg) { _announceText.text = ">> " + msg.ToUpperInvariant(); _announceTimer = 2.6f; }

    // ---------- Discord + wallet identity corner ----------
    GameObject _idCorner;
    string _idCornerState = "";
    string _idLastError = "";
    float _idPollTimer;

    string IdentityState() =>
        (DiscordAuth.LoggedIn ? "d" : "-") + (WalletAuth.Connected ? "w" : "-") + (WalletAuth.Busy ? "b" : "-");

    void BuildIdentityCorner()
    {
        if (_idCorner != null) Destroy(_idCorner);
        _idCorner = new GameObject("identityCorner");
        _idCorner.transform.SetParent(_homePanel.transform, false);
        var rt = _idCorner.AddComponent<RectTransform>();
        rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;
        _idCornerState = IdentityState();

        // row 1: Discord — logo only when logged out, name + ✕ when logged in
        if (DiscordAuth.Available)
        {
            if (DiscordAuth.LoggedIn)
            {
                var db = MakeButton(_idCorner.transform,
                    "DISCORD: " + DiscordAuth.DisplayName.ToUpperInvariant() + "  ✕",
                    new Vector2(0.865f, 0.92f), new Vector2(330, 44),
                    new Color(0.55f, 0.62f, 1f), () => { DiscordAuth.Logout(); BuildIdentityCorner(); });
                db.GetComponentInChildren<Text>().fontSize = 18;
            }
            else
            {
                var db = MakeButton(_idCorner.transform, "", new Vector2(0.945f, 0.92f), new Vector2(58, 58),
                    new Color(0.55f, 0.62f, 1f), () => DiscordAuth.Login());
                var logoTex = Resources.Load<Texture2D>("icons/discord");
                if (logoTex != null)
                {
                    var logo = NewImage(db.transform, "logo", new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(46, 46));
                    logo.sprite = Sprite.Create(logoTex, new Rect(0, 0, logoTex.width, logoTex.height), new Vector2(0.5f, 0.5f));
                    logo.raycastTarget = false;
                }
            }
        }

        // row 2: Ronin wallet — same verified flow as classic Zeal Survivors
        if (WalletAuth.Available)
        {
            if (WalletAuth.Connected)
            {
                var wb = MakeButton(_idCorner.transform,
                    "RONIN: " + WalletAuth.ShortAddress.ToUpperInvariant() + "  ✕",
                    new Vector2(0.88f, 0.845f), new Vector2(300, 44),
                    new Color(0.35f, 0.75f, 1f), () => { WalletAuth.Disconnect(); BuildIdentityCorner(); });
                wb.GetComponentInChildren<Text>().fontSize = 17;
            }
            else if (WalletAuth.Busy)
            {
                var wb = MakeButton(_idCorner.transform, "CONNECTING…", new Vector2(0.895f, 0.845f), new Vector2(240, 44),
                    new Color(0.35f, 0.75f, 1f), () => { });
                wb.GetComponentInChildren<Text>().fontSize = 17;
            }
            else
            {
                var wb = MakeButton(_idCorner.transform, "CONNECT RONIN", new Vector2(0.895f, 0.845f), new Vector2(240, 44),
                    new Color(0.35f, 0.75f, 1f), () => { _idLastError = ""; WalletAuth.Connect(); BuildIdentityCorner(); });
                wb.GetComponentInChildren<Text>().fontSize = 17;
            }
        }

        // last wallet error (shown until the next attempt)
        if (!string.IsNullOrEmpty(_idLastError))
        {
            var errText = NewText(_idCorner.transform, "walletErr", _idLastError.ToUpperInvariant(), 14, TextAnchor.MiddleRight,
                new Vector2(0.985f, 0.725f), new Vector2(0.985f, 0.725f), new Vector2(-260, 0), new Vector2(520, 44));
            errText.color = new Color(1f, 0.45f, 0.5f, 0.95f);
        }

        // warning while either identity is missing
        if ((DiscordAuth.Available || WalletAuth.Available) && (!DiscordAuth.LoggedIn || !WalletAuth.Connected))
        {
            var warn = NewText(_idCorner.transform, "saveWarn",
                "!! PROGRESS WILL NOT BE SAVED — CONNECT DISCORD & WALLET !!", 15, TextAnchor.MiddleRight,
                new Vector2(0.985f, 0.775f), new Vector2(0.985f, 0.775f), new Vector2(-230, 0), new Vector2(460, 30));
            warn.color = new Color(1f, 0.75f, 0.3f, 0.9f);
            warn.fontStyle = FontStyle.Bold;
        }
    }

    // ---------- Adventure hub: armory / survivors / quests / board / pass ----------
    GameObject _adventurePanel, _advContent;
    Text _advGold, _advStatus;
    string _advTab = "armory";
    MetaBridge.Summary _advSummary;
    Coroutine _advCo;

    static readonly string[] ArmoryIds = { "might", "maxhp", "armor", "recovery", "cooldown", "area", "speed" };
    static readonly string[] SurvivorIds = { "magnet", "xpgain", "greed", "revival", "reroll", "banish" };

    readonly List<Text> _advTabLabels = new List<Text>();
    static readonly string[] AdvTabs = { "armory", "survivors", "quests", "board", "pass" };

    void BuildAdventurePanel()
    {
        _adventurePanel = Panel("AdventurePanel");

        // opaque backdrop: the hub is a screen, not an overlay on the void
        var bg = NewImage(_adventurePanel.transform, "bg", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        bg.color = new Color(0.05f, 0.035f, 0.13f, 0.97f);

        var t = NewText(_adventurePanel.transform, "title", "ADVENTURE", 52, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.925f), new Vector2(0.5f, 0.925f), Vector2.zero, new Vector2(1400, 70));
        t.color = new Color(1f, 0.72f, 0.25f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;

        // gold chip, top-right (mirrors the classic armory)
        var chip = NewImage(_adventurePanel.transform, "goldChip", new Vector2(0.88f, 0.925f), new Vector2(0.88f, 0.925f), Vector2.zero, new Vector2(230, 46));
        chip.sprite = _roundedFill; chip.type = Image.Type.Sliced;
        chip.color = new Color(0.12f, 0.09f, 0.26f, 0.95f);
        var chipEdge = NewImage(chip.transform, "edge", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        chipEdge.sprite = _roundedOutline; chipEdge.type = Image.Type.Sliced;
        chipEdge.color = new Color(1f, 0.85f, 0.4f, 0.5f);
        _advGold = NewText(chip.transform, "gold", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(220, 40));
        _advGold.color = new Color(1f, 0.85f, 0.4f);
        _advGold.fontStyle = FontStyle.Bold;

        string[] labels = { "ARMORY", "SURVIVORS", "QUESTS", "LEADERBOARD", "BATTLE PASS" };
        _advTabLabels.Clear();
        for (int i = 0; i < AdvTabs.Length; i++)
        {
            string tab = AdvTabs[i];
            var b = MakeButton(_adventurePanel.transform, labels[i], new Vector2(0.26f + i * 0.12f, 0.845f), new Vector2(215, 48),
                new Color(0.95f, 0.8f, 0.5f), () => { _advTab = tab; RefreshAdventure(); });
            var lbl = b.GetComponentInChildren<Text>();
            lbl.fontSize = 18;
            _advTabLabels.Add(lbl);
        }

        _advStatus = NewText(_adventurePanel.transform, "status", "", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.125f), new Vector2(0.5f, 0.125f), Vector2.zero, new Vector2(1200, 34));
        _advStatus.color = new Color(0.6f, 0.95f, 1f);

        MakeButton(_adventurePanel.transform, "BACK", new Vector2(0.5f, 0.058f), new Vector2(300, 52),
            new Color(0.8f, 0.9f, 1f), () => { _adventurePanel.SetActive(false); _homePanel.SetActive(true); });
        _adventurePanel.SetActive(false);
    }

    // rounded card container with soft border, parented to the tab content
    GameObject AdvCard(Vector2 anchor, Vector2 size, Color? edge = null)
    {
        var go = new GameObject("card");
        go.transform.SetParent(_advContent.transform, false);
        var img = go.AddComponent<Image>();
        img.sprite = _roundedFill; img.type = Image.Type.Sliced;
        img.color = new Color(0.105f, 0.08f, 0.23f, 0.96f);
        var rt = img.rectTransform;
        rt.anchorMin = rt.anchorMax = anchor;
        rt.sizeDelta = size;
        var border = NewImage(go.transform, "border", Vector2.zero, Vector2.one, Vector2.zero, Vector2.zero);
        border.sprite = _roundedOutline; border.type = Image.Type.Sliced;
        border.color = edge ?? new Color(0.5f, 0.4f, 0.85f, 0.45f);
        return go;
    }

    void OpenAdventure()
    {
        _adventurePanel.SetActive(true);
        RefreshAdventure();
    }

    void RefreshAdventure()
    {
        if (_advCo != null) { StopCoroutine(_advCo); _advCo = null; }
        _advSummary = MetaBridge.GetSummary();
        _advStatus.text = "";
        _advGold.text = _advSummary != null ? "GOLD  " + _advSummary.gold.ToString("N0") : "";
        if (_advContent != null) Destroy(_advContent);
        _advContent = new GameObject("advContent");
        _advContent.transform.SetParent(_adventurePanel.transform, false);
        var rt = _advContent.AddComponent<RectTransform>();
        rt.anchorMin = Vector2.zero; rt.anchorMax = Vector2.one;
        rt.offsetMin = Vector2.zero; rt.offsetMax = Vector2.zero;

        for (int i = 0; i < _advTabLabels.Count; i++)
        {
            bool active = AdvTabs[i] == _advTab;
            _advTabLabels[i].color = active ? new Color(1f, 0.85f, 0.4f) : new Color(0.75f, 0.7f, 0.95f, 0.8f);
            _advTabLabels[i].fontStyle = active ? FontStyle.Bold : FontStyle.Normal;
        }

        if (_advSummary == null)
        {
            NewText(_advContent.transform, "msg", "ADVENTURE NEEDS THE ONLINE VERSION\nPLAY AT MARKOFTHEZEAL.COM/ZEALSURVIVORSV2", 26, TextAnchor.MiddleCenter,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(1200, 100))
                .color = new Color(1f, 0.75f, 0.3f);
            return;
        }

        switch (_advTab)
        {
            case "armory": BuildUpgradeCards(ArmoryIds, "Permanent ship upgrades. They apply to every run, forever."); break;
            case "survivors": BuildUpgradeCards(SurvivorIds, "Survivor training. Crew-wide perks for every run."); break;
            case "quests": BuildQuestCards(); break;
            case "board": BuildBoardTab("weekly"); break;
            case "pass": BuildPassTab(); break;
        }
    }

    void AdvHeader(string text)
    {
        NewText(_advContent.transform, "hdr", text, 19, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.785f), new Vector2(0.5f, 0.785f), Vector2.zero, new Vector2(1300, 30))
            .color = new Color(0.75f, 0.72f, 0.95f, 0.8f);
    }

    // one armory-style card: name, desc, rank pips, buy button
    void UpgradeCard(MetaBridge.Upgrade up, Vector2 anchor)
    {
        var card = AdvCard(anchor, new Vector2(370, 172),
            up.rank > 0 ? new Color(1f, 0.85f, 0.4f, 0.45f) : (Color?)null);
        var name = NewText(card.transform, "name", up.name, 22, TextAnchor.MiddleLeft,
            new Vector2(0.5f, 0.83f), new Vector2(0.5f, 0.83f), Vector2.zero, new Vector2(330, 30));
        name.color = up.rank > 0 ? new Color(1f, 0.85f, 0.4f) : Color.white;
        name.fontStyle = FontStyle.Bold;
        NewText(card.transform, "desc", up.desc, 16, TextAnchor.MiddleLeft,
            new Vector2(0.5f, 0.63f), new Vector2(0.5f, 0.63f), Vector2.zero, new Vector2(330, 26))
            .color = new Color(0.75f, 0.72f, 0.95f, 0.9f);
        for (int i = 0; i < up.maxRank; i++)
        {
            var pip = NewImage(card.transform, "pip" + i, new Vector2(0.095f + i * 0.085f, 0.455f),
                new Vector2(0.095f + i * 0.085f, 0.455f), Vector2.zero, new Vector2(24, 11));
            pip.sprite = _roundedFill; pip.type = Image.Type.Sliced;
            pip.color = i < up.rank ? new Color(1f, 0.85f, 0.4f) : new Color(0.3f, 0.26f, 0.5f);
        }
        bool maxed = up.rank >= up.maxRank;
        string idCopy = up.id;
        var buy = MakeButton(card.transform, maxed ? "MAXED" : up.cost.ToString("N0") + " GOLD",
            new Vector2(0.5f, 0.19f), new Vector2(320, 42),
            maxed ? new Color(0.55f, 0.6f, 0.75f) : (_advSummary.gold >= up.cost ? new Color(0.55f, 1f, 0.65f) : new Color(1f, 0.55f, 0.55f)),
            () => {
                var r = MetaBridge.Buy(idCopy);
                _advStatus.text = r.ok ? "UPGRADED!" : (r.err ?? "").ToUpperInvariant();
                RefreshAdventure();
            });
        buy.GetComponentInChildren<Text>().fontSize = 17;
    }

    void BuildUpgradeCards(string[] ids, string header)
    {
        AdvHeader(header);
        int col = 0, row = 0;
        foreach (var id in ids)
        {
            MetaBridge.Upgrade up = null;
            foreach (var u in _advSummary.upgrades) if (u.id == id) { up = u; break; }
            if (up == null) continue;
            UpgradeCard(up, new Vector2(0.29f + col * 0.21f, 0.655f - row * 0.185f));
            if (++col == 3) { col = 0; row++; }
        }
    }

    void BuildQuestCards()
    {
        AdvHeader("Daily quests reset at 00:00 UTC. Finish runs to progress, then claim gold + pass XP.");
        float y = 0.655f;
        foreach (var q in _advSummary.quests)
        {
            var card = AdvCard(new Vector2(0.5f, y), new Vector2(1050, 86),
                q.done && !q.claimed ? new Color(0.55f, 1f, 0.65f, 0.5f) : (Color?)null);
            var d = NewText(card.transform, "q", q.desc, 21, TextAnchor.MiddleLeft,
                new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(-140, 0), new Vector2(600, 40));
            d.color = q.claimed ? new Color(0.6f, 0.62f, 0.8f) : q.done ? new Color(0.55f, 1f, 0.65f) : Color.white;
            d.fontStyle = FontStyle.Bold;
            NewText(card.transform, "r", "+" + q.gold + " GOLD   +" + q.xp + " PASS XP", 17, TextAnchor.MiddleCenter,
                new Vector2(0.71f, 0.5f), new Vector2(0.71f, 0.5f), Vector2.zero, new Vector2(260, 40))
                .color = new Color(1f, 0.85f, 0.4f, 0.9f);
            string qid = q.id;
            var b = MakeButton(card.transform, q.claimed ? "CLAIMED" : q.done ? "CLAIM" : "IN PROGRESS",
                new Vector2(0.9f, 0.5f), new Vector2(175, 44),
                q.done && !q.claimed ? new Color(0.55f, 1f, 0.65f) : new Color(0.55f, 0.6f, 0.75f),
                () => { if (MetaBridge.ClaimQuest(qid)) { _advStatus.text = "REWARD CLAIMED!"; RefreshAdventure(); } });
            b.GetComponentInChildren<Text>().fontSize = 15;
            y -= 0.115f;
        }
        NewText(_advContent.transform, "life",
            "LIFETIME   ·   RUNS " + _advSummary.lifetimeRuns.ToString("N0") +
            "   ·   KILLS " + _advSummary.lifetimeKills.ToString("N0") +
            "   ·   BEST SCORE " + _advSummary.bestScore.ToString("N0"),
            18, TextAnchor.MiddleCenter, new Vector2(0.5f, y - 0.02f), new Vector2(0.5f, y - 0.02f),
            Vector2.zero, new Vector2(1200, 30)).color = new Color(0.75f, 0.72f, 0.95f, 0.7f);
    }

    void BuildBoardTab(string period)
    {
        AdvHeader("One leaderboard across classic Zeal Survivors and The Void.");
        MakeButton(_advContent.transform, "WEEKLY", new Vector2(0.42f, 0.72f), new Vector2(190, 42),
            period == "weekly" ? new Color(1f, 0.85f, 0.4f) : new Color(0.7f, 0.8f, 0.9f),
            () => BuildBoardSwitch("weekly")).GetComponentInChildren<Text>().fontSize = 17;
        MakeButton(_advContent.transform, "ALL-TIME", new Vector2(0.58f, 0.72f), new Vector2(190, 42),
            period == "alltime" ? new Color(1f, 0.85f, 0.4f) : new Color(0.7f, 0.8f, 0.9f),
            () => BuildBoardSwitch("alltime")).GetComponentInChildren<Text>().fontSize = 17;
        var card = AdvCard(new Vector2(0.5f, 0.435f), new Vector2(980, 470));
        var rows = NewText(card.transform, "rows", "FETCHING…", 20, TextAnchor.UpperCenter,
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), new Vector2(0, -12), new Vector2(900, 430));
        rows.color = new Color(0.9f, 0.95f, 1f);
        MetaBridge.BoardFetch(period);
        _advCo = StartCoroutine(PollBoard(rows));
    }

    void BuildBoardSwitch(string period)
    {
        if (_advCo != null) { StopCoroutine(_advCo); _advCo = null; }
        foreach (Transform c in _advContent.transform) Destroy(c.gameObject);
        BuildBoardTab(period);
    }

    System.Collections.IEnumerator PollBoard(Text rows)
    {
        for (int i = 0; i < 30; i++)
        {
            yield return new WaitForSecondsRealtime(0.35f);
            var b = MetaBridge.BoardTake();
            if (b == null) continue;
            if (!b.ok) { rows.text = "BOARD UNAVAILABLE — " + (b.reason ?? "OFFLINE").ToUpperInvariant(); yield break; }
            var sb = new System.Text.StringBuilder();
            int shown = 0;
            foreach (var r in b.rows)
            {
                shown++;
                if (shown > 10) break;
                sb.AppendLine(shown + ".  " + (r.premium ? "★ " : "") + r.name.ToUpperInvariant() + "   " + r.score.ToString("N0"));
            }
            if (shown == 0) sb.AppendLine("NO SCORES YET — BE THE FIRST!");
            if (b.me != null && b.me.rank > 0)
                sb.AppendLine("\nYOUR RANK: #" + b.me.rank + "  (" + b.me.score.ToString("N0") + ")");
            rows.text = sb.ToString();
            yield break;
        }
        rows.text = "BOARD TIMED OUT — TRY AGAIN";
    }

    void BuildPassTab()
    {
        var s = _advSummary;
        AdvHeader("Season " + s.seasonId + " — " + s.seasonName + ". Earn pass XP from run scores and quests.");

        var card = AdvCard(new Vector2(0.5f, 0.565f), new Vector2(900, 250),
            s.premium ? new Color(1f, 0.85f, 0.4f, 0.5f) : (Color?)null);
        var tier = NewText(card.transform, "tier", "TIER " + s.passTier + " / " + s.passTiers,
            30, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.83f), new Vector2(0.5f, 0.83f), Vector2.zero, new Vector2(800, 44));
        tier.color = new Color(1f, 0.85f, 0.4f);
        tier.fontStyle = FontStyle.Bold;

        // XP progress bar to the next tier
        float frac = Mathf.Clamp01((s.passXp % Mathf.Max(1, s.xpPerTier)) / (float)Mathf.Max(1, s.xpPerTier));
        var barBg = NewImage(card.transform, "barBg", new Vector2(0.5f, 0.62f), new Vector2(0.5f, 0.62f), Vector2.zero, new Vector2(720, 16));
        barBg.sprite = _roundedFill; barBg.type = Image.Type.Sliced;
        barBg.color = new Color(0.28f, 0.24f, 0.48f);
        var barFill = NewImage(barBg.transform, "fill", new Vector2(0f, 0.5f), new Vector2(0f, 0.5f),
            new Vector2(Mathf.Max(10f, 720f * frac) / 2f, 0), new Vector2(Mathf.Max(10f, 720f * frac), 16));
        barFill.sprite = _roundedFill; barFill.type = Image.Type.Sliced;
        barFill.color = new Color(1f, 0.85f, 0.4f);
        NewText(card.transform, "xp", (s.passXp % s.xpPerTier) + " / " + s.xpPerTier + " XP TO NEXT TIER",
            16, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.47f), new Vector2(0.5f, 0.47f), Vector2.zero, new Vector2(700, 26))
            .color = new Color(0.75f, 0.72f, 0.95f, 0.9f);
        var prem = NewText(card.transform, "prem",
            s.premium ? "★ PREMIUM ACTIVE — +20% PASS XP + PREMIUM REWARD TRACK" : "REWARDS: GOLD · REROLLS · BANISHES · REVIVALS · COSMETICS",
            17, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.28f), new Vector2(0.5f, 0.28f), Vector2.zero, new Vector2(860, 30));
        prem.color = s.premium ? new Color(1f, 0.85f, 0.4f) : new Color(0.75f, 0.72f, 0.95f, 0.9f);

        if (s.claimable > 0)
            MakeButton(_advContent.transform, "CLAIM " + s.claimable + " REWARD" + (s.claimable > 1 ? "S" : ""),
                new Vector2(0.5f, 0.36f), new Vector2(340, 52), new Color(0.55f, 1f, 0.65f),
                () => { int n = MetaBridge.ClaimAllRewards(); _advStatus.text = n + " REWARDS CLAIMED!"; RefreshAdventure(); });

        if (!s.premium && WalletAuth.Available)
        {
            MakeButton(_advContent.transform, "BUY PREMIUM PASS — " + s.priceRon + " RON",
                new Vector2(0.5f, s.claimable > 0 ? 0.27f : 0.34f), new Vector2(420, 56), new Color(0.35f, 0.75f, 1f),
                () => { MetaBridge.PassBuy(); _advCo = StartCoroutine(PollPass()); });
            if (!WalletAuth.Connected)
                NewText(_advContent.transform, "needwallet", "CONNECT YOUR RONIN WALLET ON THE HOMEPAGE FIRST", 17, TextAnchor.MiddleCenter,
                    new Vector2(0.5f, s.claimable > 0 ? 0.2f : 0.27f), new Vector2(0.5f, s.claimable > 0 ? 0.2f : 0.27f), Vector2.zero, new Vector2(900, 30))
                    .color = new Color(1f, 0.75f, 0.3f);
        }
    }

    System.Collections.IEnumerator PollPass()
    {
        for (int i = 0; i < 400; i++)
        {
            yield return new WaitForSecondsRealtime(0.5f);
            var p = MetaBridge.GetPassStatus();
            if (p == null) continue;
            if (p.busy) { _advStatus.text = (p.status ?? "").ToUpperInvariant(); continue; }
            _advStatus.text = p.ok ? "★ PREMIUM PASS UNLOCKED!" : (p.reason ?? "PURCHASE FAILED").ToUpperInvariant();
            if (p.ok) RefreshAdventure();
            yield break;
        }
    }

    void PollIdentity()
    {
        if (_homePanel == null || !_homePanel.activeInHierarchy) return;
        _idPollTimer -= Time.deltaTime;
        if (_idPollTimer > 0f) return;
        _idPollTimer = 1f;
        string err = WalletAuth.PullError();
        if (!string.IsNullOrEmpty(err)) { _idLastError = err; BuildIdentityCorner(); return; }
        if (IdentityState() != _idCornerState) BuildIdentityCorner();
    }
    public void FlashDamage() { _vignetteAlpha = 1f; }
    public void PulseShield() { }

    public void DamagePopup(int amount, Vector3 worldPos)
    {
        if (Camera.main == null) return;
        Vector3 sp = Camera.main.WorldToScreenPoint(worldPos + Random.insideUnitSphere * 1.5f);
        if (sp.z < 0) return;
        var t = NewText(_canvas.transform, "dmg", amount.ToString(), 21, TextAnchor.MiddleCenter,
            Vector2.zero, Vector2.zero, Vector2.zero, new Vector2(160, 34));
        t.color = new Color(1f, 1f, 0.85f);
        t.fontStyle = FontStyle.Bold;
        t.rectTransform.position = sp + new Vector3(Random.Range(-18f, 18f), Random.Range(-6f, 14f), 0f);
        t.gameObject.AddComponent<ScorePopupAnim>();
    }

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

    Sprite _roundedFill, _roundedOutline;

    // 9-sliceable rounded rectangle; outline version is just the rim
    Sprite RoundedSprite(bool outline)
    {
        const int S = 64;
        const float radius = 14f, thickness = 3.5f;
        var tex = new Texture2D(S, S, TextureFormat.RGBA32, false);
        Vector2 half = new Vector2(S / 2f, S / 2f);
        for (int y = 0; y < S; y++)
            for (int x = 0; x < S; x++)
            {
                Vector2 q = new Vector2(Mathf.Abs(x + 0.5f - half.x), Mathf.Abs(y + 0.5f - half.y))
                          - (half - Vector2.one * radius);
                float d = new Vector2(Mathf.Max(q.x, 0f), Mathf.Max(q.y, 0f)).magnitude
                          + Mathf.Min(Mathf.Max(q.x, q.y), 0f) - radius + 1f;
                float a;
                if (outline)
                    a = Mathf.Clamp01(0.5f - d) * Mathf.Clamp01((d + thickness) / 1.2f);
                else
                    a = Mathf.Clamp01(0.5f - d);
                tex.SetPixel(x, y, new Color(1, 1, 1, a));
            }
        tex.Apply();
        return Sprite.Create(tex, new Rect(0, 0, S, S), new Vector2(0.5f, 0.5f), 100f, 0,
            SpriteMeshType.FullRect, new Vector4(20, 20, 20, 20));
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
