// The voice of the void, demoted to text-only comms: callouts render as
// a caption under the wave banner instead of browser speech. Pitch/rate
// params kept so call sites stay untouched.
public static class Announcer
{
    public static void Say(string line, float pitch = 0.6f, float rate = 1.02f)
    {
        if (string.IsNullOrEmpty(line) || GameManager.I == null) return;
        GameManager.I.AnnounceText(line);
    }
}
