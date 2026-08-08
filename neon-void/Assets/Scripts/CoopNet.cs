using System;
using System.Collections;
using System.Runtime.InteropServices;
using UnityEngine;
using UnityEngine.Networking;

// WebRTC transport for co-op. The browser does the heavy lifting
// (NVNet.jslib); this side pumps signaling through the markofthezeal.com
// mailbox until the peer-to-peer channel opens, then just sends/receives
// game strings. In the editor the externs are stubs — co-op is
// WebGL-only, tested in the browser.
public class CoopNet : MonoBehaviour
{
    const string Api = "https://www.markofthezeal.com/api/survive2/rtc";

#if UNITY_WEBGL && !UNITY_EDITOR
    [DllImport("__Internal")] static extern void NVNetInit(int isHost, int wantMic);
    [DllImport("__Internal")] static extern void NVNetSignal(string json);
    [DllImport("__Internal")] static extern IntPtr NVNetPollSignal();
    [DllImport("__Internal")] static extern void NVNetSend(string msg);
    [DllImport("__Internal")] static extern IntPtr NVNetPoll();
    [DllImport("__Internal")] static extern int NVNetState();
    [DllImport("__Internal")] static extern void NVNetMicOn(int on);
    [DllImport("__Internal")] static extern void NVNetVoiceVolume(float v);
    [DllImport("__Internal")] static extern void NVNetClose();
    [DllImport("__Internal")] static extern void NVNetFree(IntPtr p);
    [DllImport("__Internal")] static extern void NVMicStart();
    [DllImport("__Internal")] static extern int NVMicLevel();
    [DllImport("__Internal")] static extern void NVMicStop();
#else
    static void NVNetInit(int isHost, int wantMic) { }
    static void NVNetSignal(string json) { }
    static IntPtr NVNetPollSignal() => IntPtr.Zero;
    static void NVNetSend(string msg) { }
    static IntPtr NVNetPoll() => IntPtr.Zero;
    static int NVNetState() => 0;
    static void NVNetMicOn(int on) { }
    static void NVNetVoiceVolume(float v) { }
    static void NVNetClose() { }
    static void NVNetFree(IntPtr p) { }
    static void NVMicStart() { }
    static int NVMicLevel() => -1;
    static void NVMicStop() { }
#endif

    // voice controls (safe to call any time; no-ops without a session)
    public static void SetMic(bool on) => NVNetMicOn(on ? 1 : 0);
    public static void SetVoiceVolume(float v) => NVNetVoiceVolume(Mathf.Clamp01(v));
    public static void MicTestStart() => NVMicStart();
    public static int MicTestLevel() => NVMicLevel();
    public static void MicTestStop() => NVMicStop();

    static string TakeString(IntPtr p)
    {
        if (p == IntPtr.Zero) return null;
        string s = Marshal.PtrToStringUTF8(p);
        NVNetFree(p);
        return s;
    }

    [Serializable] class SigPost { public string room, from, msg; }
    [Serializable] class SigResp { public string[] msgs; public int next; }

    public bool Open { get; private set; }

    Action<string> _onMsg;
    Action<int> _onState;
    string _room, _role;
    int _cursor;
    int _lastState;

    public void Connect(bool host, string room, Action<string> onMsg, Action<int> onState)
    {
        _room = room;
        _role = host ? "host" : "guest";
        _onMsg = onMsg;
        _onState = onState;
        NVNetInit(host ? 1 : 0, 1);   // mic joins the same negotiation; denied mic = silent link
        StartCoroutine(SignalLoop());
    }

    public void Send(string msg)
    {
        if (Open) NVNetSend(msg);
    }

    void Update()
    {
        int state = NVNetState();
        if (state != _lastState)
        {
            _lastState = state;
            Open = state == 1;
            _onState?.Invoke(state);
        }
        if (!Open) return;
        // drain everything the channel received this frame
        for (int i = 0; i < 200; i++)
        {
            string m = TakeString(NVNetPoll());
            if (m == null) break;
            _onMsg?.Invoke(m);
        }
    }

    IEnumerator SignalLoop()
    {
        float elapsed = 0f;
        while (elapsed < 120f && NVNetState() == 0)
        {
            // outgoing: push our SDP/ICE to the room mailbox
            string s;
            while ((s = TakeString(NVNetPollSignal())) != null)
            {
                var body = JsonUtility.ToJson(new SigPost { room = _room, from = _role, msg = s });
                using (var post = new UnityWebRequest(Api, "POST"))
                {
                    post.uploadHandler = new UploadHandlerRaw(System.Text.Encoding.UTF8.GetBytes(body));
                    post.downloadHandler = new DownloadHandlerBuffer();
                    post.SetRequestHeader("Content-Type", "application/json");
                    post.timeout = 6;
                    yield return post.SendWebRequest();
                }
            }

            // incoming: pull the other side's SDP/ICE
            using (var get = UnityWebRequest.Get(Api + "?room=" + UnityWebRequest.EscapeURL(_room) + "&for=" + _role + "&after=" + _cursor))
            {
                get.timeout = 6;
                yield return get.SendWebRequest();
                if (get.result == UnityWebRequest.Result.Success)
                {
                    SigResp resp = null;
                    try { resp = JsonUtility.FromJson<SigResp>(get.downloadHandler.text); } catch { }
                    if (resp != null && resp.msgs != null)
                    {
                        foreach (var m in resp.msgs) NVNetSignal(m);
                        _cursor = resp.next;
                    }
                }
            }

            yield return new WaitForSecondsRealtime(1f);
            elapsed += 1f;
        }
        if (NVNetState() == 0) _onState?.Invoke(-1);   // signaling timed out
    }

    void OnDestroy() => NVNetClose();
}
