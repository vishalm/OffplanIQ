// apps/web/emails/WeeklyDigest.tsx
// React Email template for the Sunday digest
// Preview: npx email preview

import {
  Html, Head, Body, Container, Section,
  Text, Heading, Hr, Link, Row, Column,
} from '@react-email/components'

interface DigestProject {
  name: string
  area: string
  score: number
  scoreDelta: number
  currentPsf: number
  psfDeltaPct: number
  sellthroughPct: number
}

interface DigestAlert {
  title: string
  body: string
  type: 'score_drop' | 'score_rise' | 'new_launch' | 'handover_delay'
}

interface Props {
  userName: string
  weekOf: string                  // e.g. "7 Apr 2026"
  watchlistProjects: DigestProject[]
  marketAvgPsf: number
  marketPsfDeltaPct: number
  newLaunches: DigestProject[]
  alerts: DigestAlert[]
  unsubscribeUrl: string
}

export default function WeeklyDigest({
  userName = 'Investor',
  weekOf = '7 Apr 2026',
  watchlistProjects = [],
  marketAvgPsf = 2180,
  marketPsfDeltaPct = 9.3,
  newLaunches = [],
  alerts = [],
  unsubscribeUrl = '#',
}: Props) {
  return (
    <Html>
      <Head />
      <Body style={{ backgroundColor: '#f9fafb', fontFamily: 'Inter, sans-serif', margin: 0 }}>
        <Container style={{ maxWidth: 600, margin: '0 auto', padding: '32px 16px' }}>

          {/* Header */}
          <Section style={{ marginBottom: 24 }}>
            <Text style={{ fontSize: 13, color: '#9ca3af', margin: '0 0 4px' }}>
              OffplanIQ · Week of {weekOf}
            </Text>
            <Heading style={{ fontSize: 22, fontWeight: 500, color: '#111827', margin: 0 }}>
              Your weekly property pulse
            </Heading>
            <Text style={{ fontSize: 14, color: '#6b7280', margin: '6px 0 0' }}>
              Hi {userName} — here's what moved in your watchlist this week.
            </Text>
          </Section>

          {/* Market snapshot */}
          <Section style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
            <Text style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
              Dubai market · this week
            </Text>
            <Row>
              <Column style={{ width: '50%' }}>
                <Text style={{ fontSize: 13, color: '#6b7280', margin: '0 0 2px' }}>Avg PSF</Text>
                <Text style={{ fontSize: 20, fontWeight: 500, color: '#111827', margin: 0 }}>
                  AED {marketAvgPsf.toLocaleString()}
                </Text>
                <Text style={{ fontSize: 12, color: '#16a34a', margin: '2px 0 0' }}>
                  +{marketPsfDeltaPct}% YoY
                </Text>
              </Column>
            </Row>
          </Section>

          {/* Alerts */}
          {alerts.length > 0 && (
            <Section style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                Alerts from your watchlist
              </Text>
              {alerts.map((alert, i) => (
                <Section key={i} style={{ borderBottom: i < alerts.length - 1 ? '1px solid #f3f4f6' : 'none', paddingBottom: 12, marginBottom: 12 }}>
                  <Text style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: '0 0 2px' }}>
                    {alert.title}
                  </Text>
                  <Text style={{ fontSize: 13, color: '#6b7280', margin: 0 }}>
                    {alert.body}
                  </Text>
                </Section>
              ))}
            </Section>
          )}

          {/* Watchlist summary */}
          {watchlistProjects.length > 0 && (
            <Section style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                Your watchlist
              </Text>
              {watchlistProjects.map((p, i) => (
                <Row key={i} style={{ borderBottom: i < watchlistProjects.length - 1 ? '1px solid #f3f4f6' : 'none', padding: '10px 0' }}>
                  <Column style={{ width: '55%' }}>
                    <Text style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: '0 0 2px' }}>{p.name}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>{p.area} · {p.sellthroughPct}% sold</Text>
                  </Column>
                  <Column style={{ width: '25%', textAlign: 'right' }}>
                    <Text style={{ fontSize: 13, color: p.psfDeltaPct >= 0 ? '#16a34a' : '#dc2626', margin: 0, fontWeight: 500 }}>
                      {p.psfDeltaPct >= 0 ? '+' : ''}{p.psfDeltaPct}% PSF
                    </Text>
                  </Column>
                  <Column style={{ width: '20%', textAlign: 'right' }}>
                    <Text style={{ fontSize: 14, fontWeight: 500, color: p.score >= 75 ? '#16a34a' : p.score >= 55 ? '#d97706' : '#dc2626', margin: 0 }}>
                      {p.score}
                    </Text>
                  </Column>
                </Row>
              ))}
              <Link href="https://offplaniq.com/dashboard" style={{ display: 'inline-block', marginTop: 12, fontSize: 13, color: '#111827', fontWeight: 500 }}>
                View full watchlist →
              </Link>
            </Section>
          )}

          {/* New launches */}
          {newLaunches.length > 0 && (
            <Section style={{ backgroundColor: '#fff', border: '1px solid #e5e7eb', borderRadius: 12, padding: 20, marginBottom: 20 }}>
              <Text style={{ fontSize: 11, fontWeight: 500, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.06em', margin: '0 0 12px' }}>
                New launches this week
              </Text>
              {newLaunches.map((p, i) => (
                <Row key={i} style={{ borderBottom: i < newLaunches.length - 1 ? '1px solid #f3f4f6' : 'none', padding: '8px 0' }}>
                  <Column style={{ width: '70%' }}>
                    <Text style={{ fontSize: 14, color: '#111827', margin: '0 0 2px' }}>{p.name} · {p.area}</Text>
                    <Text style={{ fontSize: 12, color: '#9ca3af', margin: 0 }}>AED {p.currentPsf.toLocaleString()} PSF</Text>
                  </Column>
                  <Column style={{ width: '30%', textAlign: 'right' }}>
                    <Text style={{ fontSize: 14, fontWeight: 500, color: '#111827', margin: 0 }}>Score {p.score}</Text>
                  </Column>
                </Row>
              ))}
            </Section>
          )}

          {/* Footer */}
          <Hr style={{ borderColor: '#e5e7eb', margin: '24px 0' }} />
          <Text style={{ fontSize: 12, color: '#9ca3af', textAlign: 'center', margin: 0 }}>
            OffplanIQ · Dubai, UAE ·{' '}
            <Link href={unsubscribeUrl} style={{ color: '#9ca3af' }}>Unsubscribe</Link>
          </Text>

        </Container>
      </Body>
    </Html>
  )
}
