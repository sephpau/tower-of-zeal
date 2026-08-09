using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

// Battle royale over the multi-peer star: up to 8 pilots + spectators in
// one room. The host relays state (12Hz pose bundles, fire events, zone
// ticks) and referees eliminations; damage is victim-authoritative like
// duels — bolts you see are bolts that can kill you. Last ship flying wins.
// Eliminated pilots (and WATCH joiners) spectate with J/K camera cycling.
public class RoyaleSync : MonoBehaviour
{
    public static RoyaleSync I { get; private set; }
    public static bool Active;       // a royale session exists
    public static bool Playing;      // a match is underway locally
    public static bool Spectating;   // local eyes only — no ship in the fight

    public class PlayerInfo
    {
        public int slot;
        public string peerId = "";       // network id — carried in the roster for audio edges
        public string name = "PILOT";
        public int pilot;
        public int team;                 // 0 = solo/FFA, 1-4 = squads A-D
        public int lives = 3;
        public int kills;
        public int[] taken = new int[8];   // host bookkeeping: damage this player took, by shooter
        public bool alive = true;
        public GameObject ghost;
        public Vector3 targetPos, vel;
        public Quaternion targetRot = Quaternion.identity;
        public bool hasPose;
        public float shield, hull, maxShield = 1f, maxHull = 1f;
    }

    public Action<string> onStatus;
    public Action onLobby;
    public Action onRosterChanged;
    public Action<int> onCountdown;
    public Action onStarted;
    public Action onKicked;   // we were shown the airlock

    public bool InLobby { get; private set; }
    public string Room => _room;
    public bool IsHostRole => _net != null && _net.IsHost;
    public readonly List<PlayerInfo> players = new List<PlayerInfo>();
    public int spectatorCount;
    public int aliveCount;
    public int mySlot = -1;              // -1 = spectator
    public float ZoneShrinkIn => _zoneTimer;
    public float ZoneRadius => _zoneRadius;
    public Vector3 ZoneCenter => _zoneCenter;

    const int MaxPlayers = 8;
    const float PoseEvery = 1f / 12f;

    CoopNet _net;
    string _room = "", _myName = "PILOT";
    int _myPilot;
    int _myLives = 3;
    bool _isSpectator, _localDead, _started, _counting;
    int _myPlacement;
    Health _localHealth;
    int _nextSlot = 1;
    readonly Dictionary<string, PlayerInfo> _byPeer = new Dictionary<string, PlayerInfo>();
    readonly HashSet<string> _spectators = new HashSet<string>();

    Vector3 _zoneCenter = Vector3.zero;
    float _zoneRadius = 420f, _zoneTarget = 420f, _zoneTimer = 35f;
    int _zoneStage;
    GameObject _zoneSphere;
    float _zoneBroadcastTimer;

    float _poseTimer, _statTimer;
    readonly System.Text.StringBuilder _fire = new System.Text.StringBuilder();
    int _spectateIdx;

    // per-player match stats: who's carrying, who's cargo
    readonly int[] _dmgFrom = new int[8];   // damage I took, by shooter slot
    int _lastHitBy = -1;
    float _lastHitTime;
    public readonly List<string> lastMatchStats = new List<string>();

    public static void NoteHitOnMe(GameObject owner, float dmg)
    {
        if (I == null || !Playing || owner == null) return;
        var shooter = I.players.Find(x => x.ghost == owner);
        if (shooter == null || shooter.slot < 0 || shooter.slot >= 8) return;
        I._dmgFrom[shooter.slot] += Mathf.Max(1, Mathf.RoundToInt(dmg));
        I._lastHitBy = shooter.slot;
        I._lastHitTime = Time.unscaledTime;
    }

    int RecentKiller() => _lastHitBy >= 0 && Time.unscaledTime - _lastHitTime < 6f ? _lastHitBy : -1;

    string TakenBlob()
    {
        var sb = new System.Text.StringBuilder();
        for (int i = 0; i < 8; i++) { if (i > 0) sb.Append(','); sb.Append(_dmgFrom[i]); }
        return sb.ToString();
    }

    static string F(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);
    static float PF(string s) => float.Parse(s, CultureInfo.InvariantCulture);
    static string CleanName(string s) =>
        (string.IsNullOrWhiteSpace(s) ? "PILOT" : s.Trim()).Replace("|", "").Replace(";", "").Replace(",", "");

    public static RoyaleSync Begin(bool host, string room, string name, int pilot, bool spectator)
    {
        CoopSync.Cancel();
        if (I != null) Destroy(I.gameObject);
        var go = new GameObject("RoyaleSession");
        DontDestroyOnLoad(go);
        I = go.AddComponent<RoyaleSync>();
        Active = true;
        I._room = string.IsNullOrEmpty(room) ? "VOID" : room.Trim().ToUpperInvariant();
        I._myName = CleanName(name);
        I._myPilot = Mathf.Clamp(pilot, 0, ZealData.Pilots.Length - 1);
        I._isSpectator = spectator && !host;   // the host always flies
        I._net = go.AddComponent<CoopNet>();
        I._net.keepSignalingOpen = true;   // audio edges handshake peer-to-peer
        I._net.onPeerJoined = I.OnPeerJoined;
        I._net.onPeerLeft = I.OnPeerLeft;
        I._net.Connect(host, I._room, I.OnMessage, I.OnNetState);
        if (host)
        {
            var me = new PlayerInfo { slot = 0, peerId = "host", name = I._myName, pilot = I._myPilot };
            I.players.Add(me);
            I.mySlot = 0;
            I.InLobby = true;
        }
        return I;
    }

    public static void Cancel()
    {
        if (I != null) Destroy(I.gameObject);
    }

    void OnDestroy()
    {
        if (I == this)
        {
            I = null;
            Active = Playing = Spectating = false;
        }
    }

    public PlayerInfo MyInfo => players.Find(p => p.slot == mySlot);
    PlayerInfo Me => MyInfo;
    PlayerInfo BySlot(int slot) => players.Find(p => p.slot == slot);

    void Relay(string exceptPeer, string msg)
    {
        foreach (var id in _net.Peers)
            if (id != exceptPeer) _net.Send(id, msg);
    }

    // ---------- connection events ----------
    void OnNetState(int state)   // joiner link
    {
        if (state == 1)
        {
            CoopNet.SetVoiceVolume(GameSettings.VoiceVolume);
            onStatus?.Invoke("CONNECTED — CHECKING IN…");
            _net.Send("host", "HELLO|" + _myName + "|" + _myPilot + "|" + (_isSpectator ? "s" : "p"));
        }
        else if (state == 2) HandleLinkLost();
        else if (state == -1) onStatus?.Invoke("NO ROOM FOUND — CHECK THE CODE AND TRY AGAIN");
    }

    void OnPeerJoined(string id)
    {
        if (!IsHostRole) return;
        CoopNet.SetVoiceVolume(GameSettings.VoiceVolume);
        // roster entry waits for their HELLO
    }

    void OnPeerLeft(string id)
    {
        if (!IsHostRole) return;
        if (_spectators.Remove(id)) { BroadcastRoster(); return; }
        if (_byPeer.TryGetValue(id, out var p))
        {
            _byPeer.Remove(id);
            if (_started && p.alive) EliminateSlot(p.slot, " (DISCONNECTED)");
            else players.Remove(p);
            BroadcastRoster();
            onRosterChanged?.Invoke();
        }
    }

    void HandleLinkLost()
    {
        if (Playing && GameManager.I != null && GameManager.I.Running)
        {
            GameManager.I.Banner("HOST LOST — MATCH VOID");
            GameManager.I.CoopGameOver();
        }
        else onStatus?.Invoke("CONNECTION LOST — LEAVE AND TRY AGAIN");
        Active = false;
        Playing = false;
    }

    // ---------- lobby ----------
    public void SetLobbyPilot(int idx)
    {
        if (_counting || _started) return;
        _myPilot = Mathf.Clamp(idx, 0, ZealData.Pilots.Length - 1);
        var me = Me;
        if (me != null) me.pilot = _myPilot;
        if (IsHostRole) BroadcastRoster();
        else _net.Send("host", "LOB|" + _myPilot);
        onRosterChanged?.Invoke();
    }

    public int MyPilot => _myPilot;
    public int MyLives => _myLives;

    // squads: 0 = solo/FFA, 1-4 = teams A-D. Two duos = your 2v2.
    public void SetTeam(int team)
    {
        if (_counting || _started) return;
        team = Mathf.Clamp(team, 0, 4);
        var me = Me;
        if (me != null) me.team = team;
        if (IsHostRole) { BroadcastRoster(); onRosterChanged?.Invoke(); }
        else _net.Send("host", "TEAM|" + team);
    }

    public bool SameTeam(PlayerInfo a, PlayerInfo b) =>
        a != null && b != null && a.team > 0 && a.team == b.team;

    // host shows a pilot the airlock — lobby removal, mid-match elimination
    public void HostKick(int slot)
    {
        if (!IsHostRole || slot == 0) return;
        var p = BySlot(slot);
        if (p == null || string.IsNullOrEmpty(p.peerId)) return;
        _net.Send(p.peerId, "KICKED");
        StartCoroutine(KickLater(p.peerId, slot));
    }

    IEnumerator KickLater(string peerId, int slot)
    {
        yield return new WaitForSecondsRealtime(0.5f);   // let KICKED flush first
        _net.Kick(peerId);
        _byPeer.Remove(peerId);
        var p = BySlot(slot);
        if (p != null)
        {
            if (_started && p.alive) EliminateSlot(slot, " (KICKED)");
            else players.Remove(p);
        }
        BroadcastRoster();
        onRosterChanged?.Invoke();
    }

    public void HostStartMatch()
    {
        if (!IsHostRole || _counting || _started) return;
        if (players.Count < 2) { onStatus?.Invoke("NEED AT LEAST 2 PILOTS TO LAUNCH"); return; }
        _net.Broadcast("CNT");
        StartCoroutine(CountdownCo());
    }

    IEnumerator CountdownCo()
    {
        if (_counting) yield break;
        _counting = true;
        for (int n = 3; n >= 1; n--)
        {
            onCountdown?.Invoke(n);
            yield return new WaitForSecondsRealtime(1f);
        }
        onCountdown?.Invoke(0);
        _counting = false;
        StartMatch();
    }

    void BroadcastRoster()
    {
        var sb = new System.Text.StringBuilder("ROSTER|");
        foreach (var p in players)
            sb.Append(p.slot).Append(',').Append(p.name).Append(',').Append(p.pilot)
              .Append(',').Append(p.alive ? 1 : 0).Append(',').Append(p.team)
              .Append(',').Append(p.lives).Append(',').Append(p.peerId).Append(';');
        sb.Append('|').Append(_spectators.Count);
        _net.Broadcast(sb.ToString());
        spectatorCount = _spectators.Count;
    }

    // ---------- match flow ----------
    void StartMatch()
    {
        if (_started) return;
        _started = true;
        InLobby = false;
        Playing = true;
        _localDead = false;
        Spectating = _isSpectator;
        aliveCount = players.Count;
        _myPlacement = 0;
        _myLives = 3;
        System.Array.Clear(_dmgFrom, 0, 8);
        _lastHitBy = -1;
        lastMatchStats.Clear();
        foreach (var pl in players)
        {
            pl.lives = 3;
            pl.kills = 0;
            System.Array.Clear(pl.taken, 0, 8);
        }
        StartCoroutine(StopSignalingLater());   // grace period for audio-edge handshakes

        onStarted?.Invoke();
        GameManager.I.StartRun(_myPilot);

        var ship = FindAnyObjectByType<ShipController>();
        _localHealth = ship != null ? ship.GetComponent<Health>() : null;

        // spawn ring: every pilot computes every position the same way
        if (!_isSpectator && ship != null && mySlot >= 0)
        {
            Vector3 pos = SpawnPos(mySlot, players.Count);
            float yaw = Mathf.Atan2(-pos.x, -pos.z) * Mathf.Rad2Deg;   // face the center
            ship.SetPose(pos, yaw);
        }
        if (_isSpectator && ship != null)
        {
            ship.enabled = false;
            ship.gameObject.SetActive(false);
        }

        foreach (var p in players)
            if (p.slot != mySlot) BuildGhostFor(p);

        // zone
        _zoneCenter = Vector3.zero;
        _zoneRadius = _zoneTarget = 420f;
        _zoneTimer = 35f;
        _zoneStage = 0;
        BuildZoneSphere();

        ApplyVoiceRouting();
        if (Spectating) SpectateNext(0);
        GameManager.I.Banner("BATTLE ROYALE // " + _room + " // " + aliveCount + " SHIPS");
    }

    IEnumerator StopSignalingLater()
    {
        yield return new WaitForSecondsRealtime(25f);
        if (_started && _net != null) _net.StopSignaling();
    }

    // team-scoped comms: squads hear only each other; all-FFA rooms get open
    // comms; enemies get silence. Each client gates its own OUTGOING audio.
    void ApplyVoiceRouting()
    {
        var me = Me;
        foreach (var p in players)
        {
            if (p.slot == mySlot || string.IsNullOrEmpty(p.peerId)) continue;
            bool friendly = me != null && ((me.team == 0 && p.team == 0) || SameTeam(me, p));
            if (IsHostRole || p.peerId == "host")
                _net.VoiceTo(p.peerId, friendly);                      // gate the existing data link
            else if (friendly && string.CompareOrdinal(_net.MyId, p.peerId) < 0)
                _net.DialAudio(p.peerId);                              // lower id dials the audio edge
            else
                _net.VoiceTo(p.peerId, friendly);                      // (re)gate any edge from last round
        }
    }

    void RestoreLobbyVoice()
    {
        foreach (var p in players)
            if (p.slot != mySlot && !string.IsNullOrEmpty(p.peerId))
                _net.VoiceTo(p.peerId, true);
    }

    static Vector3 SpawnPos(int slot, int count)
    {
        float a = slot / (float)Mathf.Max(1, count) * Mathf.PI * 2f;
        return new Vector3(Mathf.Cos(a) * 190f, (slot % 2 == 0 ? 18f : -18f), Mathf.Sin(a) * 190f);
    }

    void BuildGhostFor(PlayerInfo p)
    {
        if (p.ghost != null || !p.alive) return;
        var g = PlayerShipFactory.Build(SpawnPos(p.slot, players.Count));
        g.name = "royale-" + p.slot;
        foreach (var c in new MonoBehaviour[] {
            g.GetComponent<ShipController>(), g.GetComponent<SpecialAttack>(),
            g.GetComponent<ActiveSkills>(), g.GetComponent<Weapon>(),
            g.GetComponent<SkillSystem>(), g.GetComponent<DashFlourish>() })
            if (c != null) { c.enabled = false; Destroy(c); }
        Destroy(g.GetComponent<Health>());
        var rb = g.GetComponent<Rigidbody>();
        if (rb != null) rb.isKinematic = true;
        var tint = g.GetComponent<ShipTint>();
        if (tint != null) tint.Apply(ZealData.Pilots[Mathf.Clamp(p.pilot, 0, ZealData.Pilots.Length - 1)].accent);
        NVOutline.Add(g, SameTeam(Me, p) ? NVOutline.Ally : NVOutline.Hostile, 0.03f);
        p.ghost = g;
        p.targetPos = g.transform.position;
        p.hasPose = false;
    }

    void BuildZoneSphere()
    {
        var shader = Resources.Load<Shader>("NVZone");
        if (shader == null) return;
        _zoneSphere = GameObject.CreatePrimitive(PrimitiveType.Sphere);
        _zoneSphere.name = "zone";
        Destroy(_zoneSphere.GetComponent<Collider>());
        _zoneSphere.GetComponent<MeshRenderer>().sharedMaterial = new Material(shader);
        _zoneSphere.transform.position = _zoneCenter;
        _zoneSphere.transform.localScale = Vector3.one * _zoneRadius * 2f;
    }

    // ---------- messages ----------
    void OnMessage(string from, string m)
    {
        var p = m.Split('|');
        switch (p[0])
        {
            // ----- host side -----
            case "HELLO":
                if (!IsHostRole || p.Length < 4) break;
                if (p[3] == "s" || _started || players.Count >= MaxPlayers)
                {
                    _spectators.Add(from);
                    _net.Send(from, "WELCOME|-1|" + (_started ? 1 : 0));
                }
                else
                {
                    var np = new PlayerInfo { slot = _nextSlot++, peerId = from, name = CleanName(p[1]) };
                    int.TryParse(p[2], out np.pilot);
                    players.Add(np);
                    _byPeer[from] = np;
                    _net.Send(from, "WELCOME|" + np.slot + "|0");
                }
                BroadcastRoster();
                onRosterChanged?.Invoke();
                break;
            case "LOB":
                if (!IsHostRole) break;
                if (_byPeer.TryGetValue(from, out var lp) || (lp = players.Find(x => x.peerId == from)) != null)
                {
                    int.TryParse(p[1], out lp.pilot);
                    _byPeer[from] = lp;
                    BroadcastRoster();
                    onRosterChanged?.Invoke();
                }
                break;
            case "TEAM":
                if (!IsHostRole) break;
                var tp = players.Find(x => x.peerId == from);
                if (tp != null && p.Length >= 2)
                {
                    int.TryParse(p[1], out tp.team);
                    tp.team = Mathf.Clamp(tp.team, 0, 4);
                    BroadcastRoster();
                    onRosterChanged?.Invoke();
                }
                break;
            case "TK":
                if (!IsHostRole || p.Length < 2) break;
                var tkp = players.Find(x => x.peerId == from);
                if (tkp != null)
                {
                    var cells = p[1].Split(',');
                    for (int i = 0; i < 8 && i < cells.Length; i++) int.TryParse(cells[i], out tkp.taken[i]);
                }
                break;
            case "DOWN":
                if (!IsHostRole) break;
                var dwp = players.Find(x => x.peerId == from);
                if (dwp != null && p.Length >= 2)
                {
                    int.TryParse(p[1], out dwp.lives);
                    if (p.Length >= 3 && int.TryParse(p[2], out int downBy) && downBy >= 0)
                    {
                        var killer = BySlot(downBy);
                        if (killer != null) killer.kills++;
                    }
                    if (dwp.ghost != null) HideGhostWithBoom(dwp);
                    _net.Broadcast("DOWNB|" + dwp.slot + "|" + dwp.lives);
                    GameManager.I.Banner(dwp.name.ToUpperInvariant() + " IS DOWN — " + dwp.lives + " LIVES LEFT");
                }
                break;
            case "RESP":
                if (!IsHostRole) break;
                var rsp = players.Find(x => x.peerId == from);
                if (rsp != null)
                {
                    if (rsp.ghost != null) rsp.ghost.SetActive(true);
                    _net.Broadcast("RESPB|" + rsp.slot);
                }
                break;
            case "DOWNB":
                if (IsHostRole || p.Length < 3 || !int.TryParse(p[1], out int dbs) || dbs == mySlot) break;
                var dbp = BySlot(dbs);
                if (dbp != null)
                {
                    int.TryParse(p[2], out dbp.lives);
                    if (dbp.ghost != null) HideGhostWithBoom(dbp);
                    GameManager.I.Banner(dbp.name.ToUpperInvariant() + " IS DOWN — " + dbp.lives + " LIVES LEFT");
                }
                break;
            case "RESPB":
                if (IsHostRole || p.Length < 2 || !int.TryParse(p[1], out int rbs) || rbs == mySlot) break;
                var rbp = BySlot(rbs);
                if (rbp != null && rbp.ghost != null) rbp.ghost.SetActive(true);
                break;
            case "P":
                if (!IsHostRole) break;
                var pp = players.Find(x => x.peerId == from);
                if (pp != null) ApplyPose(pp, p, 1);
                break;
            case "F":
                if (!IsHostRole || p.Length < 2) break;
                var fp = players.Find(x => x.peerId == from);
                if (fp != null)
                {
                    SpawnEnemyFire(fp, p[1]);
                    Relay(from, "RF|" + fp.slot + "|" + p[1]);
                }
                break;
            case "DIE":
                if (!IsHostRole) break;
                var dp = players.Find(x => x.peerId == from);
                if (dp != null && dp.alive)
                {
                    if (p.Length >= 2 && int.TryParse(p[1], out int dieBy)) CreditKill(dieBy);
                    EliminateSlot(dp.slot, "");
                }
                break;

            // ----- joiner side -----
            case "WELCOME":
                if (p.Length < 3) break;
                int.TryParse(p[1], out mySlot);
                if (mySlot < 0) _isSpectator = true;
                InLobby = true;
                onLobby?.Invoke();
                if (p[2] == "1") StartMatch();   // match already underway — straight to watching
                break;
            case "ROSTER":
                if (IsHostRole || p.Length < 3) break;
                ParseRoster(p);
                onRosterChanged?.Invoke();
                break;
            case "CNT":
                if (!IsHostRole) StartCoroutine(CountdownCo());
                break;
            case "RPALL":
                if (IsHostRole || p.Length < 2) break;
                foreach (var entry in p[1].Split(';'))
                {
                    if (entry.Length == 0) continue;
                    var c = entry.Split(',');
                    if (c.Length < 16 || !int.TryParse(c[0], out int slot) || slot == mySlot) continue;
                    var rp = BySlot(slot);
                    if (rp != null) ApplyPoseCsv(rp, c);
                }
                break;
            case "RF":
                if (IsHostRole || p.Length < 3 || !int.TryParse(p[1], out int fslot) || fslot == mySlot) break;
                var shooter = BySlot(fslot);
                if (shooter != null) SpawnEnemyFire(shooter, p[2]);
                break;
            case "ELIM":
                if (p.Length < 3 || !int.TryParse(p[1], out int eslot)) break;
                int.TryParse(p[2], out aliveCount);
                var ep = BySlot(eslot);
                if (ep != null)
                {
                    ep.alive = false;
                    if (ep.ghost != null)
                    {
                        ExplosionFactory.Explode(ep.ghost.transform.position, new Color(0.4f, 0.9f, 1f), 2.2f, true);
                        ep.ghost.SetActive(false);
                    }
                    if (eslot == mySlot) _myPlacement = aliveCount + 1;
                    GameManager.I.Banner(ep.name.ToUpperInvariant() + " ELIMINATED — " + aliveCount + " LEFT");
                    GameManager.I.PlaySfx(SfxSynth.BigBoom, 0.6f);
                }
                break;
            case "ZONE":
                if (IsHostRole || p.Length < 7) break;
                _zoneCenter = new Vector3(PF(p[1]), PF(p[2]), PF(p[3]));
                _zoneRadius = PF(p[4]);
                _zoneTarget = PF(p[5]);
                _zoneTimer = PF(p[6]);
                break;
            case "WIN":
                if (p.Length < 3 || !int.TryParse(p[1], out int wslot)) break;
                EndMatch(wslot, p[2], p.Length >= 4 ? p[3] : "");
                break;
            case "KICKED":
                onStatus?.Invoke("KICKED BY THE HOST");
                onKicked?.Invoke();
                if (Playing && GameManager.I != null && GameManager.I.Running)
                    GameManager.I.CoopGameOver();
                Cancel();
                break;
        }
    }

    void ParseRoster(string[] p)
    {
        var seen = new HashSet<int>();
        foreach (var entry in p[1].Split(';'))
        {
            if (entry.Length == 0) continue;
            var c = entry.Split(',');
            if (c.Length < 4 || !int.TryParse(c[0], out int slot)) continue;
            var pl = BySlot(slot);
            if (pl == null) { pl = new PlayerInfo { slot = slot }; players.Add(pl); }
            pl.name = c[1];
            int.TryParse(c[2], out pl.pilot);
            pl.alive = c[3] == "1";
            if (c.Length >= 7)
            {
                int.TryParse(c[4], out pl.team);
                int.TryParse(c[5], out pl.lives);
                pl.peerId = c[6];
            }
            seen.Add(slot);
        }
        players.RemoveAll(x => !seen.Contains(x.slot));
        players.Sort((a, b) => a.slot.CompareTo(b.slot));
        int.TryParse(p[2], out spectatorCount);
    }

    void ApplyPose(PlayerInfo pl, string[] p, int offset)
    {
        if (p.Length < offset + 15) return;
        pl.targetPos = new Vector3(PF(p[offset]), PF(p[offset + 1]), PF(p[offset + 2]));
        pl.targetRot = new Quaternion(PF(p[offset + 3]), PF(p[offset + 4]), PF(p[offset + 5]), PF(p[offset + 6]));
        pl.vel = new Vector3(PF(p[offset + 7]), PF(p[offset + 8]), PF(p[offset + 9]));
        pl.shield = PF(p[offset + 11]);
        pl.hull = PF(p[offset + 12]);
        pl.maxShield = Mathf.Max(1f, PF(p[offset + 13]));
        pl.maxHull = Mathf.Max(1f, PF(p[offset + 14]));
        pl.hasPose = true;
    }

    void ApplyPoseCsv(PlayerInfo pl, string[] c)
    {
        pl.targetPos = new Vector3(PF(c[1]), PF(c[2]), PF(c[3]));
        pl.targetRot = new Quaternion(PF(c[4]), PF(c[5]), PF(c[6]), PF(c[7]));
        pl.vel = new Vector3(PF(c[8]), PF(c[9]), PF(c[10]));
        pl.shield = PF(c[12]);
        pl.hull = PF(c[13]);
        pl.maxShield = Mathf.Max(1f, PF(c[14]));
        pl.maxHull = Mathf.Max(1f, PF(c[15]));
        pl.hasPose = true;
    }

    void SpawnEnemyFire(PlayerInfo shooter, string batch)
    {
        if (!Playing) return;
        Color col = ZealData.Pilots[Mathf.Clamp(shooter.pilot, 0, ZealData.Pilots.Length - 1)].accent;
        GameObject owner = shooter.ghost;
        bool friendly = SameTeam(Me, shooter);   // squadmate bolts are all flash, no burn
        foreach (var entry in batch.Split(';'))
        {
            if (entry.Length == 0) continue;
            var c = entry.Split(',');
            if (c.Length < 7) continue;
            float dmg = (Spectating || friendly) ? 0f : PF(c[6]);
            Projectile.Spawn(new Vector3(PF(c[0]), PF(c[1]), PF(c[2])),
                new Vector3(PF(c[3]), PF(c[4]), PF(c[5])), dmg, col, owner, true, 0, ghostFire: true);
        }
    }

    // called from Projectile.Spawn — batch my own fire out to the room
    public static void OnBoltSpawned(Vector3 pos, Vector3 vel, float dmg, bool fromPlayer, GameObject owner)
    {
        if (I == null || !Active || !Playing || Spectating || !fromPlayer) return;
        if (I._localHealth == null || owner != I._localHealth.gameObject) return;
        I._fire.Append(F(pos.x)).Append(',').Append(F(pos.y)).Append(',').Append(F(pos.z))
            .Append(',').Append(F(vel.x)).Append(',').Append(F(vel.y)).Append(',').Append(F(vel.z))
            .Append(',').Append(F(dmg)).Append(';');
    }

    // ---------- elimination & win ----------
    public void OnLocalDeath()
    {
        if (_localDead) return;
        _myLives--;
        var me = Me;
        if (me != null) me.lives = _myLives;
        int killer = RecentKiller();
        if (_myLives > 0)
        {
            // down but not out — 5 seconds and you're back
            if (IsHostRole)
            {
                CreditKill(killer);
                _net.Broadcast("DOWNB|0|" + _myLives);
            }
            else _net.Send("host", "DOWN|" + _myLives + "|" + killer);
            StartCoroutine(RespawnCo());
            return;
        }
        _localDead = true;
        Spectating = true;
        if (IsHostRole)
        {
            CreditKill(killer);
            EliminateSlot(0, "");
        }
        else _net.Send("host", "DIE|" + killer);
        GameManager.I.Banner("ELIMINATED — SPECTATING (J/K TO SWITCH SHIPS)");
        SpectateNext(0);
    }

    void CreditKill(int slot)
    {
        var killer = slot >= 0 ? BySlot(slot) : null;
        if (killer != null) killer.kills++;
    }

    IEnumerator RespawnCo()
    {
        for (int s = 5; s > 0; s--)
        {
            if (!Playing || GameManager.I == null || !GameManager.I.Running) yield break;
            GameManager.I.Banner("RESPAWN IN " + s + " — " + _myLives + (_myLives == 1 ? " LIFE" : " LIVES") + " LEFT");
            yield return new WaitForSecondsRealtime(1f);
        }
        if (!Playing || GameManager.I == null || !GameManager.I.Running || _localHealth == null) yield break;
        Vector3 dir = UnityEngine.Random.onUnitSphere;
        dir.y *= 0.4f;
        Vector3 pos = _zoneCenter + dir.normalized * (_zoneRadius * 0.55f);
        var sc = _localHealth.GetComponent<ShipController>();
        _localHealth.gameObject.SetActive(true);
        if (sc != null) sc.SetPose(pos, UnityEngine.Random.Range(0f, 360f));
        _localHealth.Revive(1f);
        if (IsHostRole) _net.Broadcast("RESPB|0");
        else _net.Send("host", "RESP");
        GameManager.I.Banner("BACK IN THE FIGHT — " + _myLives + (_myLives == 1 ? " LIFE" : " LIVES") + " LEFT");
    }

    void HideGhostWithBoom(PlayerInfo p)
    {
        if (p.ghost == null) return;
        ExplosionFactory.Explode(p.ghost.transform.position, new Color(0.4f, 0.9f, 1f), 2f, true);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, p.ghost.transform.position, 0.8f);
        p.ghost.SetActive(false);
        p.hasPose = false;
    }

    void EliminateSlot(int slot, string suffix)   // host referee
    {
        var p = BySlot(slot);
        if (p == null || !p.alive) return;
        p.alive = false;
        aliveCount = players.FindAll(x => x.alive).Count;
        if (slot == mySlot) _myPlacement = aliveCount + 1;
        _net.Broadcast("ELIM|" + slot + "|" + aliveCount);
        if (p.ghost != null)
        {
            ExplosionFactory.Explode(p.ghost.transform.position, new Color(0.4f, 0.9f, 1f), 2.2f, true);
            p.ghost.SetActive(false);
        }
        if (slot != mySlot)
        {
            GameManager.I.Banner(p.name.ToUpperInvariant() + " ELIMINATED" + suffix + " — " + aliveCount + " LEFT");
            GameManager.I.PlaySfx(SfxSynth.BigBoom, 0.6f);
        }
        CheckWin();
    }

    void CheckWin()
    {
        if (!IsHostRole || !_started) return;
        var aliveP = players.FindAll(x => x.alive);
        aliveCount = aliveP.Count;
        var groups = new HashSet<string>();
        foreach (var a in aliveP) groups.Add(a.team > 0 ? "T" + a.team : "S" + a.slot);
        if (groups.Count > 1) return;   // still a fight

        int wslot = -1;
        string wname = "NOBODY";
        if (aliveP.Count > 0)
        {
            if (aliveP[0].team > 0)
            {
                wslot = -10 - aliveP[0].team;   // team victory marker
                var names = new List<string>();
                foreach (var a in aliveP) names.Add(a.name);
                wname = "TEAM " + (char)('A' + aliveP[0].team - 1) + " (" + string.Join(" + ", names) + ")";
            }
            else
            {
                wslot = aliveP[0].slot;
                wname = aliveP[0].name;
            }
        }
        // final stats: kills from the referee ledger, damage from everyone's
        // taken-tables (dealt[s] = what the whole room took from s)
        var meHost = Me;
        if (meHost != null) System.Array.Copy(_dmgFrom, meHost.taken, 8);
        var stats = new System.Text.StringBuilder();
        foreach (var pl in players)
        {
            int dealt = 0;
            foreach (var victim in players) dealt += victim.taken[Mathf.Clamp(pl.slot, 0, 7)];
            stats.Append(pl.slot).Append(',').Append(pl.kills).Append(',').Append(dealt).Append(';');
        }
        _net.Broadcast("WIN|" + wslot + "|" + wname + "|" + stats);
        EndMatch(wslot, wname, stats.ToString());
    }

    void EndMatch(int winnerSlot, string winnerName, string statsBlob = "")
    {
        if (!_started) return;
        // format the scoreboard while the roster still has everyone's names
        lastMatchStats.Clear();
        if (!string.IsNullOrEmpty(statsBlob))
        {
            var rows = new List<(string name, int kills, int dealt)>();
            foreach (var entry in statsBlob.Split(';'))
            {
                if (entry.Length == 0) continue;
                var c = entry.Split(',');
                if (c.Length < 3 || !int.TryParse(c[0], out int slot)) continue;
                var pl = BySlot(slot);
                int.TryParse(c[1], out int k);
                int.TryParse(c[2], out int d);
                rows.Add((pl != null ? pl.name.ToUpperInvariant() : "PILOT " + slot, k, d));
            }
            rows.Sort((a, b) => b.dealt.CompareTo(a.dealt));
            for (int i = 0; i < rows.Count; i++)
                lastMatchStats.Add((i == 0 ? "★ " : "   ") + rows[i].name + " — "
                    + rows[i].kills + (rows[i].kills == 1 ? " KILL · " : " KILLS · ")
                    + rows[i].dealt.ToString("N0") + " DMG");
        }
        Playing = false;
        // back-to-lobby state survives the scene reload
        _started = false;
        _counting = false;
        InLobby = true;
        Spectating = false;
        _localDead = false;
        foreach (var p in players)
        {
            p.alive = true;
            p.ghost = null;
            p.hasPose = false;
        }
        if (_zoneSphere != null) Destroy(_zoneSphere);
        _fire.Length = 0;
        _net.ResumeSignaling();   // everyone reopens the mailbox for the next round
        RestoreLobbyVoice();
        if (IsHostRole) BroadcastRoster();

        bool teamWin = winnerSlot <= -10;
        int winTeam = teamWin ? -winnerSlot - 10 : 0;
        var meNow = Me;
        bool iWon = !_isSpectator &&
            (winnerSlot == mySlot || (teamWin && meNow != null && meNow.team == winTeam));
        GameManager.I.RoyaleEnd(iWon, winnerName, _myPlacement, _isSpectator);
    }

    // ---------- per-frame ----------
    void Update()
    {
        if (_net == null || GameManager.I == null) return;

        if (!Playing || !GameManager.I.Running)
        {
            // lobby idles here; ghosts and zone only exist mid-match
            return;
        }

        // my pose out (players only)
        if (!Spectating && !_localDead && _localHealth != null)
        {
            _poseTimer -= Time.unscaledDeltaTime;
            if (_poseTimer <= 0f)
            {
                _poseTimer = PoseEvery;
                SendPoseAndFire();
            }
            _statTimer -= Time.unscaledDeltaTime;
            if (_statTimer <= 0f && Playing)
            {
                _statTimer = 1f;
                if (IsHostRole) { var me = Me; if (me != null) System.Array.Copy(_dmgFrom, me.taken, 8); }
                else _net.Send("host", "TK|" + TakenBlob());
            }
        }

        // ghosts ease toward their latest pose
        foreach (var p in players)
        {
            if (p.ghost == null || !p.ghost.activeSelf || !p.hasPose) continue;
            p.targetPos += p.vel * Time.deltaTime;
            float k = 1f - Mathf.Exp(-10f * Time.unscaledDeltaTime);
            if ((p.ghost.transform.position - p.targetPos).sqrMagnitude > 3600f)
                p.ghost.transform.SetPositionAndRotation(p.targetPos, p.targetRot);
            else
            {
                p.ghost.transform.position = Vector3.Lerp(p.ghost.transform.position, p.targetPos, k);
                p.ghost.transform.rotation = Quaternion.Slerp(p.ghost.transform.rotation, p.targetRot, k);
            }
        }

        // host runs the zone; everyone renders and suffers it
        if (IsHostRole) ZoneHostTick();
        ZoneLocalTick();

        // spectator camera cycling
        if (Spectating)
        {
            if (Input.GetKeyDown(KeyCode.J)) SpectateNext(-1);
            if (Input.GetKeyDown(KeyCode.K)) SpectateNext(1);
        }
    }

    void SendPoseAndFire()
    {
        var t = _localHealth.transform;
        var rb = _localHealth.GetComponent<Rigidbody>();
        Vector3 v = rb != null ? rb.linearVelocity : Vector3.zero;
        var sc = _localHealth.GetComponent<ShipController>();
        int guard = sc != null && sc.guarding ? 1 : 0;
        string pose = F(t.position.x) + "," + F(t.position.y) + "," + F(t.position.z)
            + "," + F(t.rotation.x) + "," + F(t.rotation.y) + "," + F(t.rotation.z) + "," + F(t.rotation.w)
            + "," + F(v.x) + "," + F(v.y) + "," + F(v.z) + "," + guard
            + "," + F(_localHealth.shield) + "," + F(_localHealth.hull)
            + "," + F(_localHealth.maxShield) + "," + F(_localHealth.maxHull);

        if (IsHostRole)
        {
            var me = Me;
            if (me != null) ApplyPoseCsv(me, ("0," + pose).Split(','));
        }
        else
            _net.Send("host", "P|" + pose.Replace(',', '|'));

        if (IsHostRole)
        {
            // bundle everyone's latest pose (mine included) for the room
            var sb = new System.Text.StringBuilder("RPALL|");
            foreach (var p in players)
                if (p.alive && p.hasPose)
                    sb.Append(p.slot).Append(',')
                      .Append(F(p.targetPos.x)).Append(',').Append(F(p.targetPos.y)).Append(',').Append(F(p.targetPos.z)).Append(',')
                      .Append(F(p.targetRot.x)).Append(',').Append(F(p.targetRot.y)).Append(',').Append(F(p.targetRot.z)).Append(',').Append(F(p.targetRot.w)).Append(',')
                      .Append(F(p.vel.x)).Append(',').Append(F(p.vel.y)).Append(',').Append(F(p.vel.z)).Append(",0,")
                      .Append(F(p.shield)).Append(',').Append(F(p.hull)).Append(',')
                      .Append(F(p.maxShield)).Append(',').Append(F(p.maxHull)).Append(';');
            _net.Broadcast(sb.ToString());
        }

        if (_fire.Length > 0)
        {
            if (IsHostRole) _net.Broadcast("RF|0|" + _fire);
            else _net.Send("host", "F|" + _fire);
            _fire.Length = 0;
        }
    }

    void ZoneHostTick()
    {
        _zoneTimer -= Time.deltaTime;
        if (_zoneTimer <= 0f)
        {
            _zoneStage++;
            _zoneTarget = Mathf.Max(60f, _zoneTarget * 0.62f);
            _zoneTimer = 35f;
        }
        _zoneBroadcastTimer -= Time.deltaTime;
        if (_zoneBroadcastTimer <= 0f)
        {
            _zoneBroadcastTimer = 1f;
            _net.Broadcast("ZONE|" + F(_zoneCenter.x) + "|" + F(_zoneCenter.y) + "|" + F(_zoneCenter.z)
                + "|" + F(_zoneRadius) + "|" + F(_zoneTarget) + "|" + F(_zoneTimer));
        }
    }

    void ZoneLocalTick()
    {
        // radius eases toward its target on every client
        if (_zoneRadius > _zoneTarget)
            _zoneRadius = Mathf.Max(_zoneTarget, _zoneRadius - (_zoneRadius - _zoneTarget + 20f) / 15f * Time.deltaTime * 15f * 0.07f);
        if (_zoneSphere != null)
        {
            _zoneSphere.transform.position = _zoneCenter;
            _zoneSphere.transform.localScale = Vector3.one * _zoneRadius * 2f;
        }
        if (!Spectating && !_localDead && _localHealth != null && _localHealth.gameObject.activeInHierarchy)
        {
            float d = Vector3.Distance(_localHealth.transform.position, _zoneCenter);
            if (d > _zoneRadius)
            {
                _localHealth.TakeDamage((5f + 2f * _zoneStage) * Time.deltaTime);
                GameManager.I.FlashDamage();
            }
        }
    }

    void SpectateNext(int dir)
    {
        var alive = players.FindAll(x => x.alive && x.slot != mySlot && x.ghost != null && x.ghost.activeSelf);
        if (alive.Count == 0) return;
        _spectateIdx = ((_spectateIdx + dir) % alive.Count + alive.Count) % alive.Count;
        var cam = Camera.main != null ? Camera.main.GetComponent<ChaseCamera>() : null;
        if (cam != null) cam.target = alive[_spectateIdx].ghost.transform;
        GameManager.I.Banner("WATCHING: " + alive[_spectateIdx].name.ToUpperInvariant());
    }
}
