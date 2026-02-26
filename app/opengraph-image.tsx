import { ImageResponse } from 'next/og';

export const runtime = 'edge';

export const size = {
  width: 1200,
  height: 630,
};

export const contentType = 'image/png';

export default function OpenGraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#050505',
          backgroundImage:
            'radial-gradient(900px circle at 20% 20%, rgba(255,255,255,0.08), transparent 55%), radial-gradient(700px circle at 80% 75%, rgba(251,191,36,0.10), transparent 55%)',
          color: '#ffffff',
          fontFamily: 'ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial',
        }}
      >
        <div
          style={{
            width: 980,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            gap: 40,
            padding: '54px 62px',
            borderRadius: 48,
            border: '1px solid rgba(255,255,255,0.10)',
            background: 'rgba(0,0,0,0.35)',
            boxShadow: '0 40px 120px rgba(0,0,0,0.75)',
          }}
        >
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ fontSize: 54, fontWeight: 700, letterSpacing: -1.2 }}>
              Shared Photo Map
            </div>
            <div style={{ fontSize: 22, color: 'rgba(255,255,255,0.68)', lineHeight: 1.35 }}>
              Plot your album on a globe. Invite friends to add theirs.
            </div>
            <div
              style={{
                marginTop: 10,
                display: 'flex',
                gap: 10,
              }}
            >
              <div
                style={{
                  fontSize: 16,
                  padding: '10px 14px',
                  borderRadius: 999,
                  background: 'rgba(251,191,36,0.16)',
                  border: '1px solid rgba(251,191,36,0.22)',
                  color: 'rgba(251,191,36,0.95)',
                }}
              >
                maps.palve.dev
              </div>
              <div
                style={{
                  fontSize: 16,
                  padding: '10px 14px',
                  borderRadius: 999,
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.72)',
                }}
              >
                Upload via invite link
              </div>
            </div>
          </div>

          <div
            style={{
              width: 300,
              height: 300,
              borderRadius: 999,
              border: '1px solid rgba(255,255,255,0.12)',
              background:
                'radial-gradient(circle at 35% 30%, rgba(255,255,255,0.22), rgba(255,255,255,0.03) 55%, rgba(0,0,0,0.65) 70%), radial-gradient(circle at 65% 70%, rgba(251,191,36,0.18), transparent 50%)',
              boxShadow: '0 30px 80px rgba(0,0,0,0.55)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <div
              style={{
                width: 228,
                height: 228,
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.16)',
                background:
                  'linear-gradient(180deg, rgba(255,255,255,0.08), rgba(0,0,0,0.12)), radial-gradient(circle at 40% 35%, rgba(251,191,36,0.16), transparent 55%)',
              }}
            />
          </div>
        </div>
      </div>
    ),
    {
      ...size,
    },
  );
}
