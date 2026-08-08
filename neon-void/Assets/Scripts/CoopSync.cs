using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using UnityEngine;

// Two-pilot co-op vs the waves, host-authoritative.
// The host runs the normal single-player simulation; the guest's world is
// a mirror: enemies are AI-less puppets steered by 10Hz snapshots, kills /
// orbs / powerups arrive as events, and damage the guest deals is claimed
// back to the host. Each side sees the other as a tinted partner saucer.
public class CoopSync : MonoBehaviour
{
    public static CoopSync I { get; private set; }
    public static bool Active;
    public static bool IsHost;
    public static bool IsGuest => Active && !IsHost;
    public static bool HostActive => Active && IsHost;

    // partner ghost, for enemy targeting and the HUD arrow (null while dead/absent)
    public static Transform RemoteShip;
    public static Vector3 RemoteVelocity;

    public Action<string> onStatus;   // lobby status line
    public Action onStarted;          // hide the co-op panel, the run begins

    const float SnapEvery = 0.1f;
    const float PoseEvery = 1f / 12f;

    CoopNet _net;
    string _room = "";
    string _myName = "PILOT";
    int _myPilot;
    string _partnerName = "PARTNER";
    int _partnerPilot;
    bool _sentHi, _gotHi, _running;
    bool _localDead, _partnerDead;
    bool _localPause, _remotePause;

    Health _localHealth;
    WaveDirector _waves;
    GameObject _ghost, _ghostBubble;
    Vector3 _ghostPos;
    Quaternion _ghostRot = Quaternion.identity;
    bool _ghostHasPose;

    float _snapTimer, _poseTimer;
    int _nextId = 1;
    int _lastWave = -1;
    readonly Dictionary<int, Health> _hostiles = new Dictionary<int, Health>();      // host: live enemies by id
    readonly Dictionary<int, Health> _puppets = new Dictionary<int, Health>();       // guest: replicas by id
    readonly Dictionary<int, float> _dmgClaims = new Dictionary<int, float>();       // guest: damage owed to the host
    readonly List<string> _events = new List<string>();
    readonly System.Text.StringBuilder _enemyBolts = new System.Text.StringBuilder();
    readonly System.Text.StringBuilder _myBolts = new System.Text.StringBuilder();
    readonly HashSet<int> _seen = new HashSet<int>();
    static readonly List<int> Scratch = new List<int>();

    static string F(float v) => v.ToString("0.##", CultureInfo.InvariantCulture);
    static float PF(string s) => float.Parse(s, CultureInfo.InvariantCulture);

    public static CoopSync Begin(bool host, string room, string name, int pilot)
    {
        if (I != null) Destroy(I.gameObject);
        var go = new GameObject("CoopSession");
        I = go.AddComponent<CoopSync>();
        Active = true;
        IsHost = host;
        I._room = string.IsNullOrEmpty(room) ? "VOID" : room.Trim().ToUpperInvariant();
        I._myName = string.IsNullOrEmpty(name) ? "PILOT" : name.Trim();
        I._myPilot = Mathf.Clamp(pilot, 0, ZealData.Pilots.Length - 1);
        I._net = go.AddComponent<CoopNet>();
        I._net.Connect(host, I._room, I.OnMessage, I.OnNetState);
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
            Active = false;
            IsHost = false;
            RemoteShip = null;
        }
    }

    void OnNetState(int state)
    {
        if (state == 1)
        {
            Debug.Log("[coop] channel open, room " + _room + " as " + (IsHost ? "host" : "guest"));
            onStatus?.Invoke("CONNECTED — SYNCING…");
            if (!_sentHi) { _sentHi = true; Send("HI|" + _myName + "|" + _myPilot); }
            TryLaunch();
        }
        else if (state == 2) HandleDisconnect();
        else if (state == -1) onStatus?.Invoke("NO PARTNER FOUND — CHECK THE ROOM CODE AND TRY AGAIN");
    }

    void TryLaunch()
    {
        if (_running || !_gotHi || !_sentHi || !_net.Open) return;
        if (IsHost) Send("GO");
        StartCoopRun();
    }

    void StartCoopRun()
    {
        if (_running) return;
        _running = true;
        Debug.Log("[coop] run starting with " + _partnerName + " (pilot " + _partnerPilot + ")");
        _waves = FindAnyObjectByType<WaveDirector>();
        var ship = FindAnyObjectByType<ShipController>();
        _localHealth = ship != null ? ship.GetComponent<Health>() : null;
        BuildGhost();
        onStarted?.Invoke();
        GameManager.I.StartRun(_myPilot);
        GameManager.I.Banner("CO-OP // " + _room + " // WITH " + _partnerName.ToUpperInvariant());
    }

    void BuildGhost()
    {
        _ghost = PlayerShipFactory.Build(new Vector3(0f, 25f, -40f));
        _ghost.name = "PartnerShip";
        foreach (var t in new MonoBehaviour[] {
            _ghost.GetComponent<ShipController>(), _ghost.GetComponent<SpecialAttack>(),
            _ghost.GetComponent<ActiveSkills>(), _ghost.GetComponent<Weapon>(),
            _ghost.GetComponent<SkillSystem>(), _ghost.GetComponent<DashFlourish>() })
            if (t != null) { t.enabled = false; Destroy(t); }
        Destroy(_ghost.GetComponent<Health>());
        var rb = _ghost.GetComponent<Rigidbody>();
        if (rb != null) rb.isKinematic = true;
        var tint = _ghost.GetComponent<ShipTint>();
        if (tint != null) tint.Apply(ZealData.Pilots[Mathf.Clamp(_partnerPilot, 0, ZealData.Pilots.Length - 1)].accent);
        _ghostBubble = FindDeep(_ghost.transform, "guardBubble");
        _ghostPos = _ghost.transform.position;
        RemoteShip = _ghost.transform;
    }

    static GameObject FindDeep(Transform root, string name)
    {
        foreach (var t in root.GetComponentsInChildren<Transform>(true))
            if (t.name == name) return t.gameObject;
        return null;
    }

    void Send(string msg) => _net.Send(msg);
    void Queue(string msg) => _events.Add(msg);

    // ---------- outgoing ----------
    void Update()
    {
        if (_net == null) return;

        // one-off events go out every frame
        if (_net.Open && _events.Count > 0)
        {
            foreach (var e in _events) Send(e);
            _events.Clear();
        }

        if (!_running || GameManager.I == null) return;

        // partner ghost follows its last pose with dead reckoning
        if (_ghost != null && _ghostHasPose)
        {
            _ghostPos += RemoteVelocity * Time.deltaTime;
            float k = 1f - Mathf.Exp(-10f * Time.unscaledDeltaTime);
            if ((_ghost.transform.position - _ghostPos).sqrMagnitude > 3600f)
                _ghost.transform.SetPositionAndRotation(_ghostPos, _ghostRot);
            else
            {
                _ghost.transform.position = Vector3.Lerp(_ghost.transform.position, _ghostPos, k);
                _ghost.transform.rotation = Quaternion.Slerp(_ghost.transform.rotation, _ghostRot, k);
            }
        }

        if (!GameManager.I.Running) return;

        _poseTimer -= Time.unscaledDeltaTime;
        if (_poseTimer <= 0f)
        {
            _poseTimer = PoseEvery;
            SendPose();
            FlushBolts(_myBolts, "PB|");
            FlushClaims();
        }

        if (IsHost)
        {
            _snapTimer -= Time.unscaledDeltaTime;
            if (_snapTimer <= 0f)
            {
                _snapTimer = SnapEvery;
                SendSnapshot();
                FlushBolts(_enemyBolts, "EB|");
            }
        }
    }

    void SendPose()
    {
        if (_localDead || _localHealth == null) return;
        var t = _localHealth.transform;
        var rb = _localHealth.GetComponent<Rigidbody>();
        Vector3 v = rb != null ? rb.linearVelocity : Vector3.zero;
        var sc = _localHealth.GetComponent<ShipController>();
        int guard = sc != null && sc.guarding ? 1 : 0;
        Send("P|" + F(t.position.x) + "|" + F(t.position.y) + "|" + F(t.position.z)
            + "|" + F(t.rotation.x) + "|" + F(t.rotation.y) + "|" + F(t.rotation.z) + "|" + F(t.rotation.w)
            + "|" + F(v.x) + "|" + F(v.y) + "|" + F(v.z) + "|" + guard);
    }

    void FlushBolts(System.Text.StringBuilder sb, string prefix)
    {
        if (sb.Length == 0) return;
        Send(prefix + sb.ToString());
        sb.Length = 0;
    }

    void FlushClaims()
    {
        if (_dmgClaims.Count == 0) return;
        foreach (var kv in _dmgClaims)
        {
            Send("D|" + kv.Key + "|" + F(kv.Value));
            if (_puppets.TryGetValue(kv.Key, out var h) && h != null)
                GameManager.I.ShowDamage(kv.Value, h.transform.position);
        }
        _dmgClaims.Clear();
    }

    // ---------- host: registry + snapshot ----------
    static string Classify(string goName)
    {
        if (goName.StartsWith("interceptor")) return "interceptor";
        if (goName.StartsWith("gunship")) return "gunship";
        if (goName.StartsWith("elite")) return "elite";
        if (goName.StartsWith("dreadnought")) return "dreadnought";
        if (goName.StartsWith("boss-")) return goName;
        return null;
    }

    void SendSnapshot()
    {
        // adopt any enemy that doesn't carry a net id yet
        foreach (var h in FindObjectsByType<Health>(FindObjectsSortMode.None))
        {
            if (h.isPlayer || h.GetComponent<NetTag>() != null) continue;
            string type = Classify(h.gameObject.name);
            if (type == null) continue;   // asteroids and other scenery stay local
            var tag = h.gameObject.AddComponent<NetTag>();
            tag.id = _nextId++;
            _hostiles[tag.id] = h;
            int id = tag.id;
            h.OnDeath += dead => {
                _hostiles.Remove(id);
                var p = dead.transform.position;
                Queue("K|" + id + "|" + F(p.x) + "|" + F(p.y) + "|" + F(p.z));
            };
        }

        var sb = new System.Text.StringBuilder();
        sb.Append("SNAP|").Append(_waves != null ? _waves.wave : 0)
          .Append('|').Append(_waves != null ? _waves.hostilesAlive : 0)
          .Append('|').Append(GameManager.I.score).Append('|');
        Scratch.Clear();
        foreach (var kv in _hostiles)
        {
            var h = kv.Value;
            if (h == null) { Scratch.Add(kv.Key); continue; }
            var p = h.transform.position;
            sb.Append(kv.Key).Append(',').Append(Classify(h.gameObject.name))
              .Append(',').Append(F(p.x)).Append(',').Append(F(p.y)).Append(',').Append(F(p.z))
              .Append(',').Append(F(h.transform.eulerAngles.y))
              .Append(',').Append(Mathf.CeilToInt(h.shield)).Append(',').Append(Mathf.CeilToInt(h.hull))
              .Append(',').Append(Mathf.CeilToInt(h.maxShield)).Append(',').Append(Mathf.CeilToInt(h.maxHull))
              .Append(';');
        }
        foreach (var id in Scratch) _hostiles.Remove(id);
        Send(sb.ToString());
    }

    // called from Projectile.Spawn — mirror bolts to the partner
    public static void OnBoltSpawned(Vector3 pos, Vector3 vel, float dmg, bool fromPlayer, GameObject owner)
    {
        if (I == null || !Active || !I._running) return;
        if (!fromPlayer)
        {
            if (IsHost && owner != null)
                I.AppendBolt(I._enemyBolts, pos, vel, dmg);
        }
        else if (owner != null && I._localHealth != null && owner == I._localHealth.gameObject)
            I.AppendBolt(I._myBolts, pos, vel, 0f);
    }

    void AppendBolt(System.Text.StringBuilder sb, Vector3 pos, Vector3 vel, float dmg)
    {
        sb.Append(F(pos.x)).Append(',').Append(F(pos.y)).Append(',').Append(F(pos.z))
          .Append(',').Append(F(vel.x)).Append(',').Append(F(vel.y)).Append(',').Append(F(vel.z))
          .Append(',').Append(F(dmg)).Append(';');
    }

    // guest: puppet damage is owed to the host, not applied locally
    public static void ForwardHit(Health h, float amount)
    {
        if (I == null || !IsGuest) return;
        var tag = h.GetComponent<NetTag>();
        if (tag == null) return;
        I._dmgClaims.TryGetValue(tag.id, out float sum);
        I._dmgClaims[tag.id] = sum + amount;
    }

    // host drops mirrored to the guest (hooked in XpOrb.Drop / Powerup.DropExact)
    public void QueueOrb(Vector3 pos, int xp) =>
        Queue("ORB|" + F(pos.x) + "|" + F(pos.y) + "|" + F(pos.z) + "|" + xp);
    public void QueuePowerup(Vector3 pos, PowerupType type) =>
        Queue("PU|" + F(pos.x) + "|" + F(pos.y) + "|" + F(pos.z) + "|" + (int)type);

    // ---------- incoming ----------
    void OnMessage(string m)
    {
        var p = m.Split('|');
        switch (p[0])
        {
            case "HI":
                if (p.Length >= 3)
                {
                    _partnerName = p[1];
                    int.TryParse(p[2], out _partnerPilot);
                }
                _gotHi = true;
                if (!_sentHi) { _sentHi = true; Send("HI|" + _myName + "|" + _myPilot); }
                if (IsHost) TryLaunch();
                break;
            case "GO":
                if (!IsHost) StartCoopRun();
                break;
            case "P":
                if (p.Length >= 12 && _ghost != null)
                {
                    _ghostPos = new Vector3(PF(p[1]), PF(p[2]), PF(p[3]));
                    _ghostRot = new Quaternion(PF(p[4]), PF(p[5]), PF(p[6]), PF(p[7]));
                    RemoteVelocity = new Vector3(PF(p[8]), PF(p[9]), PF(p[10]));
                    if (_ghostBubble != null) _ghostBubble.SetActive(p[11] == "1");
                    _ghostHasPose = true;
                }
                break;
            case "SNAP": if (IsGuest) ApplySnapshot(p); break;
            case "EB": if (IsGuest) SpawnBolts(p, false); break;
            case "PB": SpawnBolts(p, true); break;
            case "ORB":
                if (p.Length >= 5) XpOrb.Drop(new Vector3(PF(p[1]), PF(p[2]), PF(p[3])), int.Parse(p[4]));
                break;
            case "PU":
                if (p.Length >= 5) Powerup.DropExact(new Vector3(PF(p[1]), PF(p[2]), PF(p[3])), (PowerupType)int.Parse(p[4]));
                break;
            case "K":
                if (p.Length >= 5 && int.TryParse(p[1], out int kid)) OnKill(kid, new Vector3(PF(p[2]), PF(p[3]), PF(p[4])));
                break;
            case "D":
                if (IsHost && p.Length >= 3 && int.TryParse(p[1], out int did)
                    && _hostiles.TryGetValue(did, out var target) && target != null)
                    target.TakeDamage(PF(p[2]));
                break;
            case "LV":
                _remotePause = p.Length >= 2 && p[1] == "1";
                ApplyPause();
                if (_remotePause) GameManager.I.Banner(_partnerName.ToUpperInvariant() + " IS CHOOSING AN UPGRADE…");
                break;
            case "DIE":
                _partnerDead = true;
                if (_ghost != null) _ghost.SetActive(false);
                RemoteShip = null;
                if (_localDead) EndBoth(true);
                else GameManager.I.Banner("!! " + _partnerName.ToUpperInvariant() + " IS DOWN !!");
                break;
            case "RES":
                _partnerDead = false;
                if (_ghost != null) { _ghost.SetActive(true); RemoteShip = _ghost.transform; }
                GameManager.I.Banner(_partnerName.ToUpperInvariant() + " IS BACK!");
                break;
            case "OVER":
                EndBoth(false);
                break;
        }
    }

    void SpawnBolts(string[] p, bool partner)
    {
        if (p.Length < 2 || !_running) return;
        Color enemyCol = new Color(1f, 0.4f, 0.8f);
        Color partnerCol = ZealData.Pilots[Mathf.Clamp(_partnerPilot, 0, ZealData.Pilots.Length - 1)].accent;
        foreach (var entry in p[1].Split(';'))
        {
            if (entry.Length == 0) continue;
            var c = entry.Split(',');
            if (c.Length < 7) continue;
            Vector3 pos = new Vector3(PF(c[0]), PF(c[1]), PF(c[2]));
            Vector3 vel = new Vector3(PF(c[3]), PF(c[4]), PF(c[5]));
            if (partner)
                Projectile.Spawn(pos, vel, 0f, partnerCol, _ghost, true);       // partner fire is cosmetic here
            else
                Projectile.Spawn(pos, vel, PF(c[6]), enemyCol, null, false);    // enemy fire is live — dodge it
        }
    }

    void ApplySnapshot(string[] p)
    {
        if (p.Length < 5 || _waves == null) return;
        int wave = int.Parse(p[1]);
        _waves.hostilesAlive = int.Parse(p[2]);
        GameManager.I.score = int.Parse(p[3]);
        if (wave != _lastWave)
        {
            _lastWave = wave;
            _waves.wave = wave;
            if (wave > 0) GameManager.I.OnWaveStarted(wave);
        }

        _seen.Clear();
        Health bossSeen = null;
        string bossName = "";
        foreach (var entry in p[4].Split(';'))
        {
            if (entry.Length == 0) continue;
            var c = entry.Split(',');
            if (c.Length < 10 || !int.TryParse(c[0], out int id)) continue;
            string type = c[1];
            Vector3 pos = new Vector3(PF(c[2]), PF(c[3]), PF(c[4]));
            if (!_puppets.TryGetValue(id, out var h) || h == null)
            {
                h = BuildPuppet(id, type, pos);
                if (h == null) continue;
                _puppets[id] = h;
            }
            _seen.Add(id);
            var motion = h.GetComponent<PuppetMotion>();
            if (motion != null) motion.SetTarget(pos, PF(c[5]));
            h.shield = PF(c[6]); h.hull = PF(c[7]);
            h.maxShield = Mathf.Max(1f, PF(c[8])); h.maxHull = Mathf.Max(1f, PF(c[9]));
            if (type == "dreadnought") { bossSeen = h; bossName = "VOID DREADNOUGHT"; }
            else if (type.StartsWith("boss-"))
            {
                var def = System.Array.Find(ZealData.Bosses, b => "boss-" + b.id == type);
                bossSeen = h; bossName = def != null ? def.name.ToUpperInvariant() : "BOSS";
            }
        }

        Scratch.Clear();
        foreach (var kv in _puppets)
            if (!_seen.Contains(kv.Key)) Scratch.Add(kv.Key);
        foreach (var id in Scratch)
        {
            if (_puppets[id] != null) Destroy(_puppets[id].gameObject);
            _puppets.Remove(id);
        }

        if (bossSeen != null) _waves.SetBoss(bossSeen, bossName);
        else if (_waves.bossHealth != null && _waves.bossHealth.netPuppet) _waves.ClearBoss();
    }

    Health BuildPuppet(int id, string type, Vector3 pos)
    {
        int wave = GameManager.I.CurrentWave();
        GameObject go = null;
        if (type == "interceptor") go = EnemyFactory.BuildInterceptor(pos, wave);
        else if (type == "gunship") go = EnemyFactory.BuildGunship(pos, wave);
        else if (type == "elite") go = EnemyFactory.BuildElite(pos, wave);
        else if (type == "dreadnought") go = EnemyFactory.BuildDreadnought(pos);
        else if (type.StartsWith("boss-"))
        {
            var def = System.Array.Find(ZealData.Bosses, b => "boss-" + b.id == type);
            if (def != null) go = EnemyFactory.BuildMiniboss(pos, def);
        }
        if (go == null) return null;

        foreach (var c in new MonoBehaviour[] {
            go.GetComponent<EnemyAI>(), go.GetComponent<BossAI>(),
            go.GetComponent<MinibossAI>(), go.GetComponent<Weapon>(),
            go.GetComponent<BurstConfig>() })
            if (c != null) { c.enabled = false; Destroy(c); }
        var rb = go.GetComponent<Rigidbody>();
        if (rb != null) rb.isKinematic = true;
        var tag = go.AddComponent<NetTag>();
        tag.id = id;
        go.AddComponent<PuppetMotion>();
        var h = go.GetComponent<Health>();
        h.netPuppet = true;
        return h;
    }

    void OnKill(int id, Vector3 pos)
    {
        ExplosionFactory.Explode(pos, new Color(1f, 0.4f, 0.85f), 1.4f, true);
        GameManager.I.PlaySfxAt(SfxSynth.Boom, pos, 0.9f);
        if (_puppets.TryGetValue(id, out var h))
        {
            if (h != null) Destroy(h.gameObject);
            _puppets.Remove(id);
        }
    }

    // ---------- level-up pause: both ships freeze while either picks ----------
    public void SetLocalPause(bool pause)
    {
        _localPause = pause;
        Send("LV|" + (pause ? 1 : 0));
        ApplyPause();
    }

    void ApplyPause() => Time.timeScale = (_localPause || _remotePause) ? 0f : 1f;

    // ---------- death, respawn, game over ----------
    public void OnLocalDeath()
    {
        _localDead = true;
        Send("DIE");
        if (_partnerDead) { EndBoth(true); return; }
        StartCoroutine(RespawnLater());
    }

    IEnumerator RespawnLater()
    {
        for (int s = 15; s > 0; s--)
        {
            if (!GameManager.I.Running) yield break;
            GameManager.I.Banner("RESPAWN IN " + s + "…");
            yield return new WaitForSecondsRealtime(1f);
        }
        if (!GameManager.I.Running || _localHealth == null) yield break;
        _localDead = false;
        Vector3 pos = RemoteShip != null
            ? RemoteShip.position + Vector3.up * 14f + UnityEngine.Random.insideUnitSphere * 4f
            : Vector3.zero;
        var rb = _localHealth.GetComponent<Rigidbody>();
        _localHealth.transform.position = pos;
        _localHealth.gameObject.SetActive(true);
        if (rb != null) rb.linearVelocity = Vector3.zero;
        _localHealth.Revive(0.6f);
        Send("RES");
        GameManager.I.Banner("BACK IN THE FIGHT!");
    }

    void EndBoth(bool broadcast)
    {
        if (broadcast) Send("OVER");
        _localPause = _remotePause = false;
        ApplyPause();
        GameManager.I.CoopGameOver();
    }

    void HandleDisconnect()
    {
        if (!_running)
        {
            onStatus?.Invoke("CONNECTION LOST — TRY AGAIN");
            return;
        }
        _remotePause = false;
        ApplyPause();
        if (_ghost != null) _ghost.SetActive(false);
        RemoteShip = null;
        if (IsGuest && GameManager.I != null && GameManager.I.Running)
        {
            GameManager.I.Banner("PARTNER DISCONNECTED");
            GameManager.I.CoopGameOver();
        }
        else if (GameManager.I != null)
            GameManager.I.Banner("PARTNER DISCONNECTED — FLYING SOLO");
        Active = false;   // host degrades to plain single-player
    }
}

// stable across-the-wire id for a replicated enemy
public class NetTag : MonoBehaviour
{
    public int id;
}

// guest-side enemy replica: eases toward the latest snapshot pose
public class PuppetMotion : MonoBehaviour
{
    Vector3 _pos;
    float _yaw;
    bool _has;

    public void SetTarget(Vector3 pos, float yaw)
    {
        if (!_has || (pos - transform.position).sqrMagnitude > 900f)
            transform.SetPositionAndRotation(pos, Quaternion.Euler(0f, yaw, 0f));
        _pos = pos;
        _yaw = yaw;
        _has = true;
    }

    void Update()
    {
        if (!_has) return;
        float k = 1f - Mathf.Exp(-8f * Time.deltaTime);
        transform.position = Vector3.Lerp(transform.position, _pos, k);
        transform.rotation = Quaternion.Slerp(transform.rotation, Quaternion.Euler(0f, _yaw, 0f), k);
    }
}
