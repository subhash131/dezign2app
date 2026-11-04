import React, { useState, useEffect, useRef, useCallback } from "react";
import { Input } from "@workspace/ui/components/input";
import { Textarea } from "@workspace/ui/components/textarea";
import { cn } from "@workspace/ui/lib/utils";

export interface LocalInputProps
  extends React.ComponentProps<typeof Input> {
  debounceMs?: number;
}

export const LocalInput = React.forwardRef<HTMLInputElement, LocalInputProps>(
  (
    {
      value,
      onChange,
      onKeyDown,
      onFocus,
      onBlur,
      debounceMs = 300,
      spellCheck,
      ...props
    },
    ref,
  ) => {
    const [localValue, setLocalValue] = useState<string>(
      value !== undefined && value !== null ? String(value) : "",
    );
    const isFocusedRef = useRef(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const latestValueRef = useRef(localValue);
    latestValueRef.current = localValue;
    const lastCommittedRef = useRef(
      value !== undefined && value !== null ? String(value) : "",
    );
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Sync external prop changes only when not actively typing/focused
    useEffect(() => {
      const incoming =
        value !== undefined && value !== null ? String(value) : "";
      if (!isFocusedRef.current && incoming !== lastCommittedRef.current) {
        lastCommittedRef.current = incoming;
        setLocalValue(incoming);
      }
    }, [value]);

    const flush = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (latestValueRef.current !== lastCommittedRef.current) {
        lastCommittedRef.current = latestValueRef.current;
        if (onChangeRef.current) {
          const syntheticEvent = {
            target: { value: latestValueRef.current },
            currentTarget: { value: latestValueRef.current },
          } as React.ChangeEvent<HTMLInputElement>;
          onChangeRef.current(syntheticEvent);
        }
      }
    }, []);

    // Flush on unmount to prevent losing data
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          if (latestValueRef.current !== lastCommittedRef.current) {
            lastCommittedRef.current = latestValueRef.current;
            if (onChangeRef.current) {
              const syntheticEvent = {
                target: { value: latestValueRef.current },
                currentTarget: { value: latestValueRef.current },
              } as React.ChangeEvent<HTMLInputElement>;
              onChangeRef.current(syntheticEvent);
            }
          }
        }
      };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = e.target.value;
      setLocalValue(next);
      latestValueRef.current = next;

      if (debounceMs <= 0) {
        lastCommittedRef.current = next;
        if (onChange) onChange(e);
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (latestValueRef.current !== lastCommittedRef.current) {
          lastCommittedRef.current = latestValueRef.current;
          if (onChangeRef.current) {
            const syntheticEvent = {
              target: { value: latestValueRef.current },
              currentTarget: { value: latestValueRef.current },
            } as React.ChangeEvent<HTMLInputElement>;
            onChangeRef.current(syntheticEvent);
          }
        }
      }, debounceMs);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
      }
      if (e.key === "Enter") {
        flush();
      }
      if (onKeyDown) onKeyDown(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = true;
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      isFocusedRef.current = false;
      flush();
      onBlur?.(e);
    };

    const effectiveSpellCheck =
      spellCheck !== undefined
        ? spellCheck
        : props.className?.includes("font-mono")
          ? false
          : undefined;

    return (
      <Input
        ref={ref}
        spellCheck={effectiveSpellCheck}
        data-gramm="false"
        {...props}
        className={cn("nokey", props.className)}
        value={localValue}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  },
);
LocalInput.displayName = "LocalInput";

export interface LocalTextareaProps
  extends React.ComponentProps<typeof Textarea> {
  debounceMs?: number;
}

export const LocalTextarea = React.forwardRef<
  HTMLTextAreaElement,
  LocalTextareaProps
>(
  (
    {
      value,
      onChange,
      onKeyDown,
      onFocus,
      onBlur,
      debounceMs = 250,
      spellCheck,
      ...props
    },
    ref,
  ) => {
    const [localValue, setLocalValue] = useState<string>(
      value !== undefined && value !== null ? String(value) : "",
    );
    const isFocusedRef = useRef(false);
    const timeoutRef = useRef<NodeJS.Timeout | null>(null);
    const latestValueRef = useRef(localValue);
    latestValueRef.current = localValue;
    const lastCommittedRef = useRef(
      value !== undefined && value !== null ? String(value) : "",
    );
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    // Sync external prop changes only when not actively typing/focused
    useEffect(() => {
      const incoming =
        value !== undefined && value !== null ? String(value) : "";
      if (!isFocusedRef.current && incoming !== lastCommittedRef.current) {
        lastCommittedRef.current = incoming;
        setLocalValue(incoming);
      }
    }, [value]);

    const flush = useCallback(() => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
        timeoutRef.current = null;
      }
      if (latestValueRef.current !== lastCommittedRef.current) {
        lastCommittedRef.current = latestValueRef.current;
        if (onChangeRef.current) {
          const syntheticEvent = {
            target: { value: latestValueRef.current },
            currentTarget: { value: latestValueRef.current },
          } as React.ChangeEvent<HTMLTextAreaElement>;
          onChangeRef.current(syntheticEvent);
        }
      }
    }, []);

    // Flush on unmount to never lose data
    useEffect(() => {
      return () => {
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
          if (latestValueRef.current !== lastCommittedRef.current) {
            lastCommittedRef.current = latestValueRef.current;
            if (onChangeRef.current) {
              const syntheticEvent = {
                target: { value: latestValueRef.current },
                currentTarget: { value: latestValueRef.current },
              } as React.ChangeEvent<HTMLTextAreaElement>;
              onChangeRef.current(syntheticEvent);
            }
          }
        }
      };
    }, []);

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const next = e.target.value;
      setLocalValue(next);
      latestValueRef.current = next;

      if (debounceMs <= 0) {
        lastCommittedRef.current = next;
        if (onChange) onChange(e);
        return;
      }

      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        timeoutRef.current = null;
        if (latestValueRef.current !== lastCommittedRef.current) {
          lastCommittedRef.current = latestValueRef.current;
          if (onChangeRef.current) {
            const syntheticEvent = {
              target: { value: latestValueRef.current },
              currentTarget: { value: latestValueRef.current },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            onChangeRef.current(syntheticEvent);
          }
        }
      }, debounceMs);
    };

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Backspace" || e.key === "Delete") {
        e.stopPropagation();
        e.nativeEvent?.stopImmediatePropagation?.();
      }
      if (e.key === "Tab") {
        e.preventDefault();
        const target = e.target as HTMLTextAreaElement;
        const start = target.selectionStart;
        const end = target.selectionEnd;
        const currentVal = latestValueRef.current || "";
        const newValue =
          currentVal.substring(0, start) + "  " + currentVal.substring(end);

        setLocalValue(newValue);
        latestValueRef.current = newValue;

        if (debounceMs <= 0) {
          lastCommittedRef.current = newValue;
          if (onChangeRef.current) {
            const syntheticEvent = {
              target: { value: newValue },
              currentTarget: { value: newValue },
            } as React.ChangeEvent<HTMLTextAreaElement>;
            onChangeRef.current(syntheticEvent);
          }
        } else {
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
          }
          timeoutRef.current = setTimeout(() => {
            timeoutRef.current = null;
            if (latestValueRef.current !== lastCommittedRef.current) {
              lastCommittedRef.current = latestValueRef.current;
              if (onChangeRef.current) {
                const syntheticEvent = {
                  target: { value: latestValueRef.current },
                  currentTarget: { value: latestValueRef.current },
                } as React.ChangeEvent<HTMLTextAreaElement>;
                onChangeRef.current(syntheticEvent);
              }
            }
          }, debounceMs);
        }

        setTimeout(() => {
          target.selectionStart = target.selectionEnd = start + 2;
        }, 0);
      }
      if (onKeyDown) onKeyDown(e);
    };

    const handleFocus = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      isFocusedRef.current = true;
      onFocus?.(e);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
      isFocusedRef.current = false;
      flush();
      onBlur?.(e);
    };

    const effectiveSpellCheck =
      spellCheck !== undefined
        ? spellCheck
        : props.className?.includes("font-mono")
          ? false
          : undefined;

    return (
      <Textarea
        ref={ref}
        spellCheck={effectiveSpellCheck}
        data-gramm="false"
        {...props}
        className={cn("nokey", props.className)}
        value={localValue}
        onKeyDown={handleKeyDown}
        onChange={handleChange}
        onFocus={handleFocus}
        onBlur={handleBlur}
      />
    );
  },
);
LocalTextarea.displayName = "LocalTextarea";

