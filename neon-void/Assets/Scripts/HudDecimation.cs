using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UI;

// THE DECIMATION lobby: a live room browser (host or join), a room lobby
// with the roster and a START that also works solo, and the ranked board.
public partial class HudController
{
    GameObject _decPanel, _decLobbyPanel;
    InputField _decNameInput;
    Text _decStatus, _decLobbyRoom, _decLobbyStatus, _decCountdown, _decRoster, _decListInfo;
    Button _decStartBtn;
    readonly List<Button> _decRoomButtons = new List<Button>();
    readonly List<Text> _decRowTexts = new List<Text>();
    readonly List<Button> _decPilotButtons = new List<Button>();
    int _decPilotChoice;
    const int DecRoomRows = 8;
    const int DecRosterRows = 16;

    void BuildDecimationPanels()
    {
        // ---------- room browser ----------
        _decPanel = Panel("DecimationPanel");
        var t = NewText(_decPanel.transform, "title", "THE DECIMATION", 64, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.87f), new Vector2(0.5f, 0.87f), Vector2.zero, new Vector2(1400, 90));
        t.color = new Color(1f, 0.25f, 0.2f);
        t.fontStyle = FontStyle.BoldAndItalic;
        t.font = _titleFont;
        var sub = NewText(_decPanel.transform, "sub",
            "5-MINUTE ARENA  ·  UNLIMITED LIVES  ·  CRACK THE ASTEROID, CLAIM THE DOOM TOTEM, BECOME THE DECIMATOR\nMOST KILLS WINS (K/D BREAKS TIES)  ·  JOIN A ROOM BELOW, OR HOST YOUR OWN AND START (SOLO WORKS TOO)",
            18, TextAnchor.MiddleCenter, new Vector2(0.5f, 0.79f), new Vector2(0.5f, 0.79f), Vector2.zero, new Vector2(1500, 56));
        sub.color = new Color(0.85f, 0.9f, 1f, 0.8f);

        NewText(_decPanel.transform, "lbl", "PILOT NAME", 18, TextAnchor.MiddleCenter,
            new Vector2(0.24f, 0.71f), new Vector2(0.24f, 0.71f), Vector2.zero, new Vector2(400, 28))
            .color = new Color(1f, 0.85f, 0.4f);
        _decNameInput = MakeInput(_decPanel.transform, new Vector2(0.24f, 0.655f), "YOUR CALLSIGN");
        if (DiscordAuth.LoggedIn) _decNameInput.text = DiscordAuth.DisplayName;

        NewText(_decPanel.transform, "plbl", "PILOT", 18, TextAnchor.MiddleCenter,
            new Vector2(0.24f, 0.585f), new Vector2(0.24f, 0.585f), Vector2.zero, new Vector2(400, 28))
            .color = new Color(1f, 0.85f, 0.4f);
        _decPilotButtons.Clear();
        _decPilotChoice = 0;
        for (int i = 0; i < ZealData.Pilots.Length; i++)
        {
            int idx = i;
            float y = 0.535f - i * 0.058f;
            var pb = MakeButton(_decPanel.transform, ZealData.Pilots[i].name.ToUpperInvariant(),
                new Vector2(0.24f, y), new Vector2(260, 42), ZealData.Pilots[i].accent, () => {
                    _decPilotChoice = idx;
                    if (RoyaleSync.I != null && RoyaleSync.Decimation) RoyaleSync.I.SetLobbyPilot(idx);
                    RefreshDecPilotButtons();
                });
            pb.GetComponentInChildren<Text>().fontSize = 18;
            _decPilotButtons.Add(pb);
        }
        RefreshDecPilotButtons();

        // live rooms
        var listTitle = NewText(_decPanel.transform, "ltitle", "ACTIVE ROOMS", 26, TextAnchor.MiddleCenter,
            new Vector2(0.66f, 0.71f), new Vector2(0.66f, 0.71f), Vector2.zero, new Vector2(700, 36));
        listTitle.color = new Color(1f, 0.55f, 0.5f);
        listTitle.font = _titleFont;
        _decListInfo = NewText(_decPanel.transform, "linfo", "", 18, TextAnchor.MiddleCenter,
            new Vector2(0.66f, 0.665f), new Vector2(0.66f, 0.665f), Vector2.zero, new Vector2(700, 28));
        _decListInfo.color = new Color(0.8f, 0.9f, 1f, 0.75f);
        _decRoomButtons.Clear();
        for (int i = 0; i < DecRoomRows; i++)
        {
            float y = 0.615f - i * 0.052f;
            var rb = MakeButton(_decPanel.transform, "", new Vector2(0.66f, y), new Vector2(680, 42),
                new Color(1f, 0.85f, 0.4f), () => { });
            rb.GetComponentInChildren<Text>().fontSize = 18;
            rb.gameObject.SetActive(false);
            _decRoomButtons.Add(rb);
        }

        _decStatus = NewText(_decPanel.transform, "status", "", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.175f), new Vector2(0.5f, 0.175f), Vector2.zero, new Vector2(1200, 30));
        _decStatus.color = new Color(1f, 0.55f, 0.5f);

        MakeButton(_decPanel.transform, "HOST NEW ROOM", new Vector2(0.33f, 0.105f), new Vector2(280, 56),
            new Color(0.5f, 1f, 0.6f), () => StartDecimation(true, RoomDirectory.NewCode()));
        MakeButton(_decPanel.transform, "REFRESH", new Vector2(0.5f, 0.105f), new Vector2(220, 56),
            new Color(0.6f, 0.9f, 1f), RefreshDecimationRooms);
        MakeButton(_decPanel.transform, "BACK", new Vector2(0.67f, 0.105f), new Vector2(280, 56),
            new Color(0.8f, 0.9f, 1f), () => {
                RoyaleSync.Cancel();
                RoomDirectory.StopHosting();
                _decStatus.text = "";
                SwitchPanel(_decPanel, _homePanel);
            });
        _decPanel.SetActive(false);

        // ---------- room lobby ----------
        _decLobbyPanel = Panel("DecimationLobby");
        var lt = NewText(_decLobbyPanel.transform, "title", "DECIMATION LOBBY", 60, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.88f), new Vector2(0.5f, 0.88f), Vector2.zero, new Vector2(1200, 84));
        lt.color = new Color(1f, 0.25f, 0.2f);
        lt.font = _titleFont;
        _decLobbyRoom = NewText(_decLobbyPanel.transform, "room", "", 26, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.8f), new Vector2(0.5f, 0.8f), Vector2.zero, new Vector2(1000, 36));
        _decLobbyRoom.color = new Color(1f, 0.85f, 0.4f);
        _decRowTexts.Clear();
        for (int i = 0; i < DecRosterRows; i++)
        {
            // two columns of eight
            float x = i < 8 ? 0.34f : 0.66f;
            float y = 0.72f - (i % 8) * 0.05f;
            var row = NewText(_decLobbyPanel.transform, "drow" + i, "", 22, TextAnchor.MiddleCenter,
                new Vector2(x, y), new Vector2(x, y), Vector2.zero, new Vector2(560, 32));
            row.color = new Color(0.85f, 0.9f, 1f);
            row.gameObject.SetActive(false);
            _decRowTexts.Add(row);
        }
        _decRoster = NewText(_decLobbyPanel.transform, "roster", "", 22, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.3f), new Vector2(0.5f, 0.3f), Vector2.zero, new Vector2(900, 34));
        _decRoster.color = new Color(0.85f, 0.9f, 1f);
        _decCountdown = NewText(_decLobbyPanel.transform, "count", "", 90, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.5f), new Vector2(0.5f, 0.5f), Vector2.zero, new Vector2(400, 120));
        _decCountdown.color = new Color(1f, 0.85f, 0.4f);
        _decCountdown.font = _titleFont;
        _decLobbyStatus = NewText(_decLobbyPanel.transform, "status", "", 20, TextAnchor.MiddleCenter,
            new Vector2(0.5f, 0.245f), new Vector2(0.5f, 0.245f), Vector2.zero, new Vector2(1200, 30));
        _decLobbyStatus.color = new Color(1f, 0.55f, 0.5f);
        _decStartBtn = MakeButton(_decLobbyPanel.transform, "START", new Vector2(0.38f, 0.15f), new Vector2(300, 58),
            new Color(0.5f, 1f, 0.6f), () => { if (RoyaleSync.I != null) RoyaleSync.I.HostStartMatch(); });
        MakeButton(_decLobbyPanel.transform, "LEAVE", new Vector2(0.62f, 0.15f), new Vector2(300, 58),
            new Color(1f, 0.5f, 0.5f), () => {
                RoyaleSync.Cancel();
                RoomDirectory.StopHosting();
                _decLobbyPanel.SetActive(false);
                _decPanel.SetActive(true);
                RefreshDecimationRooms();
            });
        _decLobbyPanel.SetActive(false);
    }

    void RefreshDecPilotButtons()
    {
        for (int i = 0; i < _decPilotButtons.Count; i++)
        {
            bool sel = i == _decPilotChoice;
            _decPilotButtons[i].GetComponent<Image>().color =
                sel ? new Color(0.22f, 0.18f, 0.42f, 0.95f) : new Color(0.09f, 0.07f, 0.2f, 0.72f);
            var border = _decPilotButtons[i].transform.Find("border").GetComponent<Image>();
            border.color = new Color(border.color.r, border.color.g, border.color.b, sel ? 1f : 0.25f);
        }
    }

    void OpenDecimationLobby()
    {
        DecimationMode.Pending = false;
        SwitchPanel(_homePanel, _decPanel, RefreshDecimationRooms);
    }

    void RefreshDecimationRooms()
    {
        if (_decListInfo != null) _decListInfo.text = "LOOKING FOR ROOMS…";
        RoomDirectory.Fetch("decimation", rooms =>
        {
            if (_decPanel == null) return;
            for (int i = 0; i < _decRoomButtons.Count; i++)
            {
                bool has = i < rooms.Count;
                _decRoomButtons[i].gameObject.SetActive(has);
                if (!has) continue;
                var r = rooms[i];
                string code = r.room;
                _decRoomButtons[i].GetComponentInChildren<Text>().text =
                    code + "   ·   HOST " + r.host.ToUpperInvariant() + "   ·   " + r.players + (r.players == 1 ? " PILOT" : " PILOTS") + "   ·   JOIN";
                _decRoomButtons[i].onClick.RemoveAllListeners();
                _decRoomButtons[i].onClick.AddListener(() => StartCoroutine(PunchScale(_decRoomButtons[0].transform)));
                _decRoomButtons[i].onClick.AddListener(() => StartDecimation(false, code));
            }
            if (_decListInfo != null)
                _decListInfo.text = rooms.Count == 0
                    ? "NO OPEN ROOMS RIGHT NOW — HOST ONE AND OTHERS CAN JOIN YOU"
                    : rooms.Count + (rooms.Count == 1 ? " ROOM OPEN" : " ROOMS OPEN") + "  ·  TAP ONE TO JOIN";
        });
    }

    void StartDecimation(bool host, string roomCode)
    {
        var s = RoyaleSync.Begin(host, roomCode, _decNameInput.text, _decPilotChoice, false, true);
        BindDecSession(s);
        if (host)
            RoomDirectory.StartHosting(s.Room, "decimation",
                () => string.IsNullOrWhiteSpace(_decNameInput.text) ? "PILOT" : _decNameInput.text,
                () => RoyaleSync.I != null ? RoyaleSync.I.players.Count : 1);
        _decPanel.SetActive(false);
        _decLobbyPanel.SetActive(true);
        _decCountdown.text = "";
        _decLobbyStatus.text = host
            ? "YOU ARE HOSTING — START WHENEVER YOU LIKE, PILOTS CAN JOIN UNTIL THEN"
            : "CONNECTING TO " + roomCode.Trim().ToUpperInvariant();
        RefreshDecLobby();
    }

    void BindDecSession(RoyaleSync s)
    {
        s.onStatus = msg => {
            if (_decStatus != null) _decStatus.text = msg;
            if (_decLobbyStatus != null) _decLobbyStatus.text = msg;
        };
        s.onLobby = () => {
            _decPanel.SetActive(false);
            _homePanel.SetActive(false);
            _decLobbyPanel.SetActive(true);
            _decCountdown.text = "";
            RefreshDecLobby();
        };
        s.onRosterChanged = RefreshDecLobby;
        s.onCountdown = n => {
            _decCountdown.text = n > 0 ? n.ToString() : "DECIMATE!";
            if (GameManager.I != null) GameManager.I.PlaySfx(n > 0 ? SfxSynth.Pickup : SfxSynth.WaveUp, 0.8f);
        };
        s.onStarted = () => { _decLobbyPanel.SetActive(false); _decPanel.SetActive(false); };
        s.onKicked = () => {
            RoomDirectory.StopHosting();
            _decLobbyPanel.SetActive(false);
            _decPanel.SetActive(true);
            _decStatus.text = "KICKED BY THE HOST";
        };
    }

    void RefreshDecLobby()
    {
        var s = RoyaleSync.I;
        if (s == null || _decLobbyPanel == null) return;
        _decLobbyRoom.text = "ROOM  " + s.Room + (s.IsHostRole ? "   ·   YOU ARE HOSTING" : "");
        for (int i = 0; i < _decRowTexts.Count; i++)
        {
            bool has = i < s.players.Count;
            _decRowTexts[i].gameObject.SetActive(has);
            if (!has) continue;
            var p = s.players[i];
            string pilot = ZealData.Pilots[Mathf.Clamp(p.pilot, 0, ZealData.Pilots.Length - 1)].name.ToUpperInvariant();
            _decRowTexts[i].text = (p.slot == s.mySlot ? "> " : "") + p.name.ToUpperInvariant() + "  —  " + pilot + (p.slot == 0 ? "  (HOST)" : "");
            _decRowTexts[i].color = p.slot == s.mySlot ? new Color(0.5f, 0.98f, 1f) : new Color(0.85f, 0.9f, 1f);
        }
        _decRoster.text = s.players.Count == 0
            ? "CONNECTING…"
            : s.players.Count + (s.players.Count == 1 ? " PILOT" : " PILOTS") + " IN THE ROOM" + (s.players.Count > 16 ? "  (+" + (s.players.Count - 16) + " MORE)" : "");
        _decStartBtn.gameObject.SetActive(s.IsHostRole);
    }

    // ranked board when the host clock runs out
    public void ShowDecimationRank(List<string> rows, int myRank, int myKills, int myDeaths)
    {
        RoomDirectory.StopHosting();
        _gameHud.SetActive(false);
        if (_sideLevelPanel != null) _sideLevelPanel.SetActive(false);
        _warnBorder.color = new Color(1, 1, 1, 0);
        bool won = myRank == 1;
        string board = string.Join("\n", rows);
        if (won)
        {
            _winPanel.SetActive(true);
            _winTitle.text = "DECIMATION CHAMPION";
            _winSub.text = myKills + " KILLS  ·  " + myDeaths + " DEATHS";
            _winScore.text = "";
            _winBest.text = board;
        }
        else
        {
            _overPanel.SetActive(true);
            _overTitle.text = "DECIMATION OVER";
            _overScore.text = myRank > 0 ? "#" + myRank : "";
            _overBest.text = myKills + " KILLS  ·  " + myDeaths + " DEATHS";
            _overStats.text = board;
            _overPulse.text = "CLICK TO RETURN TO LOBBY";
        }
        Invoke(nameof(EnableRestart), 1.2f);
    }
}
