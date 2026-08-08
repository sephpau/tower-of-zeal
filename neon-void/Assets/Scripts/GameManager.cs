using UnityEngine;
using UnityEngine.SceneManagement;

public class GameManager : MonoBehaviour
{
    public static GameManager I { get; private set; }
    public bool Running { get; private set; }

    public int score;
    public int combo;
    public int best;

    // Zeal Survivors layer
    public int xpLevel = 1;
    public int xp;
    public bool Paused { get; private set; }
    SkillSystem _skills;

    float _comboTimer;
    Health _playerHealth;
    WaveDirector _waves;
    HudController _hud;
    AudioSource _sfx2d, _music;

    const string BestKey = "neon-void-best";

    void Awake()
    {
        I = this;
        best = PlayerPrefs.GetInt(BestKey, 0);
    }

    public void Init(Health playerHealth, WaveDirector waves, HudController hud)
    {
        _playerHealth = playerHealth;
        _waves = waves;
        _hud = hud;
        _playerHealth.OnDeath += OnPlayerDeath;
        _playerHealth.OnDamaged += (_, __) => _hud.PulseShield();

        _sfx2d = gameObject.AddComponent<AudioSource>();
        _sfx2d.spatialBlend = 0f;
        _music = gameObject.AddComponent<AudioSource>();
        _music.spatialBlend = 0f;
        _music.clip = SfxSynth.Music;
        _music.loop = true;
        _music.volume = 0.34f;

        _hud.ShowStart();
    }

    float _elapsed;
    public float ElapsedSeconds => _elapsed;
    int _sigilIdx;
    bool _overtimeAnnounced;
    float _eliteTimer;
    const float EliteEvery = 90f;   // v1 elite cadence

    public void StartRun(int pilotIndex)
    {
        _sigilIdx = 0;
        _overtimeAnnounced = false;
        _eliteTimer = EliteEvery;
        var actsReset = _playerHealth.GetComponent<ActiveSkills>();
        if (actsReset != null) actsReset.ResetAll();
        Running = true;
        score = 0;
        combo = 0;
        xpLevel = 1;
        xp = 0;
        _elapsed = 0f;
        _draftQueue.Clear();
        _draftOpen = false;
        if (TournamentMode.Active)
        {
            Random.InitState(unchecked((int)TournamentMode.Seed));
            TournamentNet.Begin(gameObject);
        }
        _skills = _playerHealth.GetComponent<SkillSystem>();
        _skills.InitPilot(ZealData.Pilots[Mathf.Clamp(pilotIndex, 0, ZealData.Pilots.Length - 1)]);
        var tint = _playerHealth.GetComponent<ShipTint>();
        if (tint != null) tint.Apply(_skills.pilot.accent);
        var special = _playerHealth.GetComponent<SpecialAttack>();
        if (special != null) special.Init(_skills.pilot);
        _music.Play();
        _waves.Begin();
        _hud.ShowGameHud();
        Cursor.visible = false;
        Cursor.lockState = CursorLockMode.Locked;
        _hud.WaveBanner(TournamentMode.Active
            ? "BLITZ // " + TournamentMode.MatchCode + " // " + _skills.pilot.name.ToUpperInvariant()
            : _skills.pilot.name.ToUpperInvariant() + " — " + _skills.pilot.title.ToUpperInvariant());
    }

    // every level-up gets its own draft, even when one orb jumps several
    // levels at once — drafts queue instead of overwriting each other
    readonly System.Collections.Generic.Queue<int> _draftQueue = new System.Collections.Generic.Queue<int>();
    bool _draftOpen;

    public void GainXp(int amount)
    {
        if (!Running) return;
        float tournamentBonus = TournamentMode.Active ? TournamentMode.XpBonus : 1f;
        int gained = Mathf.Max(1, Mathf.RoundToInt(amount * _skills.XpMult * tournamentBonus));
        if (xpLevel >= ZealData.MaxLevel) { score += gained * 5; return; }   // capped: xp becomes score
        xp += gained;
        PlaySfx(SfxSynth.Pickup, 0.15f);
        while (xpLevel < ZealData.MaxLevel && xp >= ZealData.XpToNext(xpLevel))
        {
            xp -= ZealData.XpToNext(xpLevel);
            xpLevel++;
            _draftQueue.Enqueue(xpLevel);
        }
        TryOpenDraft();
    }

    void TryOpenDraft()
    {
        if (_draftOpen || _draftQueue.Count == 0 || !Running) return;
        int lvl = _draftQueue.Dequeue();
        var acts = _playerHealth.GetComponent<ActiveSkills>();
        var choices = LevelUpChoices.Generate(lvl, _skills, acts, TournamentMode.Active ? TournamentMode.DraftRng(lvl) : null);
        if (choices.Count == 0) { score += 300; TryOpenDraft(); return; }
        _draftOpen = true;
        PlaySfx(SfxSynth.WaveUp, 0.6f);

        if (CoopSync.Active)
        {
            // co-op never pauses: compact side panel, J/K/L picks
            _hud.ShowLevelUpSide(lvl, choices, choice =>
            {
                choice.Apply(_skills);
                _draftOpen = false;
                TryOpenDraft();
            });
            return;
        }

        Paused = true;
        Time.timeScale = 0f;
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        _hud.ShowLevelUp(lvl, choices, choice =>
        {
            choice.Apply(_skills);
            _draftOpen = false;
            if (_draftQueue.Count > 0) { TryOpenDraft(); return; }   // stay paused, chain the next draft
            Paused = false;
            Time.timeScale = 1f;
            if (Running)
            {
                Cursor.visible = false;
                Cursor.lockState = CursorLockMode.Locked;
            }
        });
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.M))
            AudioListener.volume = AudioListener.volume > 0f ? 0f : 1f;

        if (_music != null) _music.volume = 0.34f * GameSettings.MusicVolume;

        if (!Running)
        {
            if ((Input.GetMouseButtonDown(0) || Input.GetKeyDown(KeyCode.Space)) && _hud != null && _hud.WantsRestart)
            {
                Time.timeScale = 1f;
                SceneManager.LoadScene(SceneManager.GetActiveScene().buildIndex);
            }
            return;
        }

        if (combo > 0)
        {
            _comboTimer -= Time.deltaTime;
            if (_comboTimer <= 0f) { combo = 0; _hud.SetCombo(0); }
        }

        // boss waves bring in the v1 drum layer
        if (_music != null)
        {
            var want = _waves.bossHealth != null ? SfxSynth.MusicBoss : SfxSynth.Music;
            if (_music.clip != want) { _music.clip = want; _music.Play(); }
        }

        _elapsed += Time.deltaTime;

        // Zeal Sigil grows on the run clock
        var weapon = _playerHealth.GetComponent<Weapon>();
        while (_sigilIdx < ZealData.SigilTimes.Length && _elapsed >= ZealData.SigilTimes[_sigilIdx])
        {
            _sigilIdx++;
            if (weapon != null) weapon.sigilLevel = 1 + _sigilIdx;
            _hud.WaveBanner("ZEAL SIGIL LV " + (1 + _sigilIdx));
            PlaySfx(SfxSynth.Pickup, 0.9f);
        }

        // elite hunter roams in every 90 seconds, independent of waves
        _eliteTimer -= Time.deltaTime;
        if (_eliteTimer <= 0f && !CoopSync.IsGuest)
        {
            _eliteTimer = EliteEvery;
            Vector3 dir = Random.onUnitSphere;
            dir.y *= 0.5f;
            EnemyFactory.BuildElite(_playerHealth.transform.position + dir.normalized * Random.Range(130f, 170f), CurrentWave());
            _hud.WaveBanner("!! ELITE HUNTER !!");
            PlaySfx(SfxSynth.BigBoom, 0.5f);
        }

        if (TournamentMode.Active)
        {
            float left = TournamentMode.Duration - _elapsed;
            _hud.SetTimer(left);
            if (!_overtimeAnnounced && left <= TournamentMode.Overtime)
            {
                _overtimeAnnounced = true;
                _hud.WaveBanner("!! OVERTIME !!");
                PlaySfx(SfxSynth.WaveUp, 1f);
            }
            if (left <= 0f && !CoopSync.IsGuest) EndTournament("TIME!");   // duo: the host owns the clock
        }

        _hud.Tick(_playerHealth, _waves, score);
    }

    void EndTournament(string reason)
    {
        if (!Running) return;
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        int t = Mathf.RoundToInt(Mathf.Min(_elapsed, TournamentMode.Duration));
        string verify = TournamentMode.VerifyCode(score, t);
        TournamentMode.RecordResult(score, t);
        if (CoopSync.Active && CoopSync.I != null && CoopSync.IsHost)
        {
            CoopSync.I.SendTournamentEnd(reason, score, t);   // guest mirrors this result
            CoopSync.I.ResetToLobby();
        }
        StartCoroutine(FinishTournament(reason, score, t, verify));
    }

    public void EndCoopTournament(string reason) => EndTournament(reason);

    // blitz duo, guest side: the host declared the match over — mirror it
    public void CoopEndTournament(string reason, int finalScore, int t)
    {
        if (!Running) return;
        Running = false;
        score = finalScore;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        string verify = TournamentMode.VerifyCode(finalScore, t);
        TournamentMode.RecordResult(finalScore, t);
        if (CoopSync.I != null) CoopSync.I.ResetToLobby();
        StartCoroutine(FinishTournament(reason, finalScore, t, verify));
    }

    System.Collections.IEnumerator FinishTournament(string reason, int finalScore, int t, string verify)
    {
        // push the final score and pull the shared standings before showing results
        var net = TournamentNet.I;
        if (net != null)
        {
            bool finished = false;
            StartCoroutine(net.Sync(finalScore, t, () => finished = true));
            float wait = 0f;
            while (!finished && wait < 7f) { wait += Time.unscaledDeltaTime; yield return null; }
        }

        var standings = new System.Collections.Generic.List<TournamentMode.Entry>();
        if (net != null && net.online && net.latest.Length > 0)
        {
            foreach (var e in net.latest)
                standings.Add(new TournamentMode.Entry { name = e.name, pilot = e.pilot, score = e.score, time = e.time, verify = e.verify });
        }
        else
            standings = TournamentMode.LoadStandings();   // offline fallback

        _hud.ShowTournamentResults(reason, finalScore, verify, TournamentMode.MatchCode,
            standings, net != null && net.online);
        TournamentMode.Disarm();
    }

    public void EnemyKilled(int baseScore, Vector3 where)
    {
        if (!Running) return;
        combo++;
        _comboTimer = 5f;
        int mult = 1 + Mathf.Min(7, combo / 4);
        float greed = _skills != null ? _skills.GreedMult : 1f;
        score += Mathf.RoundToInt(baseScore * mult * greed);
        _hud.SetCombo(mult >= 2 ? mult : 0);
        _hud.ScorePopup(Mathf.RoundToInt(baseScore * mult * greed), where);
        XpOrb.Drop(where, Mathf.Clamp(baseScore / 40, 1, 10));
    }

    public void OnWaveStarted(int wave)
    {
        _hud.WaveBanner(wave > WaveDirector.FinalWave
            ? "SURVIVAL WAVE " + wave
            : "WAVE " + wave + " / " + WaveDirector.FinalWave);
        PlaySfx(SfxSynth.WaveUp, 0.8f);
    }

    // campaign only: the Dreadnought falls and the endless horde begins
    public void OnSurvivalStart()
    {
        score += 2500;
        _hud.WaveBanner("SECTOR CLEARED — SURVIVAL MODE!");
        PlaySfx(SfxSynth.WaveUp, 1f);
        PlaySfx(SfxSynth.Pickup, 0.8f);
    }

    public void OnBossWave(string banner, string taunt = null)
    {
        _hud.WaveBanner(banner);
        PlaySfx(SfxSynth.WaveUp, 1f);
        PlaySfx(SfxSynth.BigBoom, 0.6f);
        if (!string.IsNullOrEmpty(taunt)) StartCoroutine(TauntLater(taunt));
    }

    System.Collections.IEnumerator TauntLater(string taunt)
    {
        yield return new WaitForSeconds(2.3f);
        if (Running) _hud.WaveBanner("“" + taunt + "”");
    }

    public int CurrentWave() => _waves != null ? _waves.wave : 1;
    public void RegisterSummon(GameObject enemy) => _waves.RegisterSummon(enemy);
    public void BossDown() { _waves.ClearBoss(); _waves.HostileDown(); }

    public void OnWaveCleared(int wave)
    {
        score += 250 * wave;
        _hud.WaveBanner("WAVE " + wave + " CLEAR  +" + (250 * wave));
    }

    public void Victory()
    {
        if (TournamentMode.Active) { EndTournament("SECTOR CLEARED"); return; }
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        bool newBest = score > best;
        if (newBest)
        {
            best = score;
            PlayerPrefs.SetInt(BestKey, best);
            PlayerPrefs.Save();
        }
        PlaySfx(SfxSynth.WaveUp, 1f);
        _hud.ShowVictory(score, best, newBest);
    }

    public void CollectPowerup(PowerupType type)
    {
        var weapon = _playerHealth != null ? _playerHealth.GetComponent<Weapon>() : null;
        PlaySfx(SfxSynth.Pickup, 0.9f);
        switch (type)
        {
            case PowerupType.Rapid:
                if (weapon != null) weapon.rapidTimer = Mathf.Max(weapon.rapidTimer, 10f);
                _hud.WaveBanner("RAPID FIRE");
                break;
            case PowerupType.ShieldCell:
                _playerHealth.shield = Mathf.Min(_playerHealth.maxShield, _playerHealth.shield + 40f);
                _playerHealth.hull = Mathf.Min(_playerHealth.maxHull, _playerHealth.hull + 10f);
                _hud.WaveBanner("SHIELD RESTORED");
                break;
        }
    }

    void OnPlayerDeath(Health h)
    {
        ExplosionFactory.Explode(h.transform.position, new Color(0.4f, 0.9f, 1f), 2.5f, true);
        PlaySfx(SfxSynth.BigBoom);
        h.gameObject.SetActive(false);
        if (CoopSync.Active && CoopSync.I != null) { CoopSync.I.OnLocalDeath(); return; }   // partner may still save the run
        if (TournamentMode.Active) { EndTournament("SHIP DESTROYED"); return; }
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;

        bool newBest = score > best;
        if (newBest)
        {
            best = score;
            PlayerPrefs.SetInt(BestKey, best);
            PlayerPrefs.Save();
        }
        _hud.ShowGameOver(score, best, newBest, _waves.wave);
    }

    public void Banner(string msg) => _hud.WaveBanner(msg);

    // co-op: both pilots down (or the guest lost its host) — end the run
    // and set the session up to meet back in the lobby after the reload
    public void CoopGameOver()
    {
        if (!Running) return;
        Running = false;
        if (CoopSync.I != null) CoopSync.I.ResetToLobby();
        _music.Stop();
        Cursor.visible = true;
        Cursor.lockState = CursorLockMode.None;
        bool newBest = score > best;
        if (newBest)
        {
            best = score;
            PlayerPrefs.SetInt(BestKey, best);
            PlayerPrefs.Save();
        }
        _hud.ShowGameOver(score, best, newBest, _waves.wave);
    }

    public void FlashDamage() => _hud.FlashDamage();

    public void ShowDamage(float amount, Vector3 worldPos)
    {
        if (Running && _hud != null) _hud.DamagePopup(Mathf.Max(1, Mathf.RoundToInt(amount)), worldPos);
    }

    public void PlaySfx(AudioClip clip, float vol = 1f)
    {
        if (clip != null && _sfx2d != null) _sfx2d.PlayOneShot(clip, vol * GameSettings.SfxVolume);
    }

    public void PlaySfxAt(AudioClip clip, Vector3 pos, float vol = 1f)
    {
        if (clip == null) return;
        AudioSource.PlayClipAtPoint(clip, pos, vol * GameSettings.SfxVolume);
    }
}
