import { EffectComposer, N8AO, SMAA } from '@react-three/postprocessing'

/**
 * Umgebungsverdeckung. Ohne sie wirken die Wandecken und die Auflagepunkte
 * der Moebel "geklebt" - genau der Effekt, der ein Modell nach Spielzeug
 * aussehen laesst. Auf schwachen Geraeten abschaltbar.
 */
export function Postprocessing({ quality }: { quality: 'hoch' | 'niedrig' }) {
  if (quality === 'niedrig') return null
  return (
    <EffectComposer enableNormalPass multisampling={0}>
      <N8AO
        aoRadius={0.75}
        distanceFalloff={0.9}
        intensity={2.6}
        halfRes
        color="#141a20"
        quality="medium"
      />
      <SMAA />
    </EffectComposer>
  )
}
