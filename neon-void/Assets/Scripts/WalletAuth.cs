using System.Runtime.InteropServices;

// Ronin wallet identity, same flow and storage keys as classic Zeal
// Survivors (see WebGL template): eth_requestAccounts → signed challenge
// → /api/staking/verify-wallet on the shared markofthezeal.com backend.
// Connect is async in the page; the HUD polls Connected/Busy/PullError.
public static class WalletAuth
{
#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern string NVWalletGetAddress();
    [DllImport("__Internal")] static extern int NVWalletIsBusy();
    [DllImport("__Internal")] static extern string NVWalletPullError();
    [DllImport("__Internal")] static extern void NVWalletDoConnect();
    [DllImport("__Internal")] static extern void NVWalletDoDisconnect();
    public const bool Available = true;
#else
    static string NVWalletGetAddress() => "";
    static int NVWalletIsBusy() => 0;
    static string NVWalletPullError() => "";
    static void NVWalletDoConnect() { }
    static void NVWalletDoDisconnect() { }
    public const bool Available = false;
#endif

    public static string Address => NVWalletGetAddress() ?? "";
    public static bool Connected => !string.IsNullOrEmpty(Address);
    public static bool Busy => NVWalletIsBusy() != 0;

    public static string ShortAddress
    {
        get
        {
            string a = Address;
            return a.Length >= 10 ? a.Substring(0, 6) + "…" + a.Substring(a.Length - 4) : a;
        }
    }

    // one-shot: returns the last connect error and clears it
    public static string PullError() => NVWalletPullError() ?? "";

    public static void Connect() => NVWalletDoConnect();
    public static void Disconnect() => NVWalletDoDisconnect();
}
