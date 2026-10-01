import { Text as DreiText } from '@react-three/drei';
import type { ComponentProps } from 'react';
import fontUrl from '../assets/font.ttf?url';

/** drei-Text med lokalt typsnitt, så scenen inte beror på ett CDN. */
export function Text(props: ComponentProps<typeof DreiText>) {
  return <DreiText font={fontUrl} {...props} />;
}
