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

    public void StartRun(int pilotIndex)
    {
        Running = true;
        score = 0;
        combo = 0;
        xpLevel = 1;
        xp = 0;
        _skills = _playerHealth.GetComponent<SkillSystem>();
        _skills.InitPilot(ZealData.Pilots[Mathf.Clamp(pilotIndex, 0, ZealData.Pilots.Length - 1)]);
        _music.Play();
        _waves.Begin();
        _hud.ShowGameHud();
        Cursor.visible = false;
        _hud.WaveBanner(_skills.pilot.name.ToUpperInvariant() + " — " + _skills.pilot.title.ToUpperInvariant());
    }

    public void GainXp(int amount)
    {
        if (!Running) return;
        xp += Mathf.Max(1, Mathf.RoundToInt(amount * _skills.XpMult));
        PlaySfx(SfxSynth.Pickup, 0.15f);
        while (xp >= ZealData.XpToNext(xpLevel))
        {
            xp -= ZealData.XpToNext(xpLevel);
            xpLevel++;
            OpenLevelUp();
        }
    }

    void OpenLevelUp()
    {
        var choices = LevelUpChoices.Generate(_skills);
        if (choices.Count == 0) { score += 300; return; }
        Paused = true;
        Time.timeScale = 0f;
        Cursor.visible = true;
        PlaySfx(SfxSynth.WaveUp, 0.6f);
        _hud.ShowLevelUp(xpLevel, choices, choice =>
        {
            choice.Apply(_skills);
            Paused = false;
            Time.timeScale = 1f;
            Cursor.visible = false;
        });
    }

    void Update()
    {
        if (Input.GetKeyDown(KeyCode.M))
            AudioListener.volume = AudioListener.volume > 0f ? 0f : 1f;

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
        _hud.Tick(_playerHealth, _waves, score);
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
        _hud.WaveBanner("WAVE " + wave + " / " + WaveDirector.FinalWave);
        PlaySfx(SfxSynth.WaveUp, 0.8f);
    }

    public void OnBossWave()
    {
        _hud.WaveBanner("!! VOID DREADNOUGHT !!");
        PlaySfx(SfxSynth.WaveUp, 1f);
        PlaySfx(SfxSynth.BigBoom, 0.6f);
    }

    public void OnWaveCleared(int wave)
    {
        score += 250 * wave;
        _hud.WaveBanner("WAVE " + wave + " CLEAR  +" + (250 * wave));
    }

    public void Victory()
    {
        Running = false;
        _music.Stop();
        Cursor.visible = true;
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
            case PowerupType.WeaponUp:
                if (weapon != null && weapon.level < Weapon.MaxLevel)
                {
                    weapon.level++;
                    _hud.WaveBanner("PULSER LV " + weapon.level);
                }
                else score += 500;   // maxed — convert to score
                break;
            case PowerupType.Rapid:
                if (weapon != null) weapon.rapidTimer = Mathf.Max(weapon.rapidTimer, 10f);
                _hud.WaveBanner("RAPID FIRE");
                break;
            case PowerupType.Homing:
                if (weapon != null) weapon.homingTimer = Mathf.Max(weapon.homingTimer, 12f);
                _hud.WaveBanner("HOMING MISSILES");
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
        Running = false;
        _music.Stop();
        Cursor.visible = true;
        ExplosionFactory.Explode(h.transform.position, new Color(0.4f, 0.9f, 1f), 2.5f, true);
        PlaySfx(SfxSynth.BigBoom);
        h.gameObject.SetActive(false);

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

    public void PlaySfx(AudioClip clip, float vol = 1f)
    {
        if (clip != null && _sfx2d != null) _sfx2d.PlayOneShot(clip, vol);
    }

    public void PlaySfxAt(AudioClip clip, Vector3 pos, float vol = 1f)
    {
        if (clip == null) return;
        AudioSource.PlayClipAtPoint(clip, pos, vol);
    }
}
