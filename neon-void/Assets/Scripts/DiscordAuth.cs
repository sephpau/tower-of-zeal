using System.Runtime.InteropServices;
using UnityEngine;

// Discord identity via the page's implicit-OAuth flow (see WebGL template).
// Login redirects the whole page to Discord and back, so it only makes
// sense from the homepage; the identity survives in localStorage.
public static class DiscordAuth
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern int NVDiscordAvailable();
    [DllImport("__Internal")] static extern string NVDiscordGetUser();
    [DllImport("__Internal")] static extern void NVDiscordLogin();
    [DllImport("__Internal")] static extern void NVDiscordLogout();
#else
    static int NVDiscordAvailable() => 0;
    static string NVDiscordGetUser() => "";
    static void NVDiscordLogin() { }
    static void NVDiscordLogout() { }
#endif

    [System.Serializable]
    class User { public string id, username, global_name, avatar; }

    public static bool Available => NVDiscordAvailable() != 0;

    public static bool LoggedIn => !string.IsNullOrEmpty(DisplayName);

    // global display name, falling back to the classic username
    public static string DisplayName
    {
        get
        {
            string raw = NVDiscordGetUser();
            if (string.IsNullOrEmpty(raw)) return "";
            try
            {
                var u = JsonUtility.FromJson<User>(raw);
                if (u == null) return "";
                return string.IsNullOrEmpty(u.global_name) ? (u.username ?? "") : u.global_name;
            }
            catch { return ""; }
        }
    }

    public static void Login() => NVDiscordLogin();
    public static void Logout() => NVDiscordLogout();
}
