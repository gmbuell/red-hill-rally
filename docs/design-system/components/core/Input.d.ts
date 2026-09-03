/** Form field — caps label, 2px black border, red focus. */
export interface InputProps {
  label?: string;
  hint?: string;
  placeholder?: string;
  type?: string;
  value?: string;
  onChange?: (e: any) => void;
}
export declare function Input(props: InputProps): JSX.Element;