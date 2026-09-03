/** Campaign action button — Bebas caps, square corners, invert on hover.
 * @startingPoint section="Core" subtitle="Primary campaign action" viewport="700x200"
 */
export interface ButtonProps {
  /** Visual style */
  variant?: 'primary' | 'accent' | 'secondary' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
  disabled?: boolean;
  children: React.ReactNode;
  onClick?: () => void;
}
export declare function Button(props: ButtonProps): JSX.Element;