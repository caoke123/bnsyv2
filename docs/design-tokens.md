# BNSY Operator — Design Tokens

> CSS Custom Properties
> Phase 2 — System Definition

---

## 1. Colors

```css
:root {
  /* === Primary === */
  --color-primary:            #2563EB;
  --color-primary-hover:      #1D4ED8;
  --color-primary-light:      #EFF6FF;

  /* === Semantic === */
  --color-success:            #16A34A;
  --color-success-light:      #F0FDF4;
  --color-warning:            #EA580C;
  --color-warning-light:      #FFF7ED;
  --color-danger:             #DC2626;
  --color-danger-light:       #FEF2F2;

  /* === Neutral === */
  --color-bg:                 #F8FAFC;
  --color-surface:            #FFFFFF;
  --color-border:             #E5E7EB;
  --color-border-light:       #F1F5F9;

  /* === Text === */
  --color-text-primary:       #0F172A;
  --color-text-secondary:     #475569;
  --color-text-tertiary:      #94A3B8;
  --color-text-inverted:      #FFFFFF;
}
```

---

## 2. Typography

```css
:root {
  /* === Font Family === */
  --font-sans:    "Inter", system-ui, -apple-system, sans-serif;
  --font-mono:    "JetBrains Mono", ui-monospace, "SF Mono", Consolas, monospace;

  /* === Font Size === */
  --text-display:     32px;
  --text-h1:          24px;
  --text-h2:          20px;
  --text-h3:          16px;
  --text-body:        14px;
  --text-caption:     13px;
  --text-small:       12px;
  --text-mono:        13px;
  --text-mono-sm:     12px;

  /* === Font Weight === */
  --weight-normal:    400;
  --weight-medium:    500;
  --weight-semibold:  600;

  /* === Line Height === */
  --leading-display:  1.2;
  --leading-h1:       1.3;
  --leading-h2:       1.35;
  --leading-h3:       1.4;
  --leading-body:     1.5;
  --leading-caption:  1.4;
  --leading-mono:     1.6;

  /* === Letter Spacing === */
  --tracking-heading:  -0.02em;
  --tracking-normal:   0;
}
```

---

## 3. Spacing

```css
:root {
  /* === 4px Base Grid === */
  --space-1:   4px;
  --space-2:   8px;
  --space-3:   12px;
  --space-4:   16px;
  --space-5:   20px;
  --space-6:   24px;
  --space-8:   32px;
  --space-12:  48px;
  --space-16:  64px;
}
```

---

## 4. Border Radius

```css
:root {
  --radius-sm:    6px;
  --radius-md:    12px;
  --radius-lg:    16px;
  --radius-full:  9999px;
}
```

---

## 5. Shadow

```css
:root {
  /* === Only shadow-sm === */
  --shadow-sm:  0 1px 2px 0 rgba(0, 0, 0, 0.05);

  /* === Focus Ring (Vercel pattern) === */
  --focus-ring: 0 0 0 2px #FFFFFF, 0 0 0 4px #2563EB;
}
```

---

## 6. Layout

```css
:root {
  /* === Dimensions === */
  --header-height:       64px;
  --sidebar-width:       240px;
  --content-max-width:   1600px;
  --content-padding:     24px;
}
```

---

## 7. Component Tokens

### Buttons

```css
:root {
  --btn-height:           40px;
  --btn-height-sm:        32px;
  --btn-radius:           var(--radius-md);
  --btn-padding-x:        20px;
  --btn-padding-x-sm:     12px;
  --btn-font-size:        var(--text-body);
  --btn-font-weight:      var(--weight-medium);

  --btn-primary-bg:       var(--color-primary);
  --btn-primary-text:     var(--color-text-inverted);
  --btn-primary-hover:    var(--color-primary-hover);

  --btn-secondary-bg:     var(--color-surface);
  --btn-secondary-text:   var(--color-text-primary);
  --btn-secondary-border: var(--color-border);
  --btn-secondary-hover:  var(--color-bg);

  --btn-ghost-text:       var(--color-text-secondary);
  --btn-ghost-hover-bg:   var(--color-border-light);
  --btn-ghost-hover-text: var(--color-text-primary);

  --btn-danger-bg:        var(--color-danger);
  --btn-danger-text:      var(--color-text-inverted);

  --btn-disabled-opacity: 0.4;
}
```

### Inputs

```css
:root {
  --input-height:         40px;
  --input-height-sm:      32px;
  --input-radius:         var(--radius-md);
  --input-padding-x:      12px;
  --input-font-size:      var(--text-body);
  --input-bg:             var(--color-surface);
  --input-border:         var(--color-border);
  --input-text:           var(--color-text-primary);
  --input-placeholder:    var(--color-text-tertiary);
  --input-focus-border:   var(--color-primary);
  --input-error-bg:       var(--color-danger-light);
  --input-error-border:   var(--color-danger);
  --input-disabled-bg:    var(--color-border-light);
  --input-disabled-text:  var(--color-text-tertiary);
}
```

### Cards

```css
:root {
  --card-radius:          var(--radius-lg);
  --card-padding:         20px;
  --card-padding-lg:      24px;
  --card-bg:              var(--color-surface);
  --card-border:          var(--color-border);
  --card-shadow:          var(--shadow-sm);
  --card-header-border:   var(--color-border-light);
}
```

### Tags / Badges

```css
:root {
  --tag-radius:           var(--radius-sm);
  --tag-padding-y:        2px;
  --tag-padding-x:        10px;
  --tag-font-size:        var(--text-small);
  --tag-font-weight:      var(--weight-medium);

  --tag-default-bg:       var(--color-border-light);
  --tag-default-text:     var(--color-text-secondary);
  --tag-success-bg:       var(--color-success-light);
  --tag-success-text:     var(--color-success);
  --tag-warning-bg:       var(--color-warning-light);
  --tag-warning-text:     var(--color-warning);
  --tag-danger-bg:        var(--color-danger-light);
  --tag-danger-text:      var(--color-danger);
  --tag-info-bg:          var(--color-primary-light);
  --tag-info-text:        var(--color-primary);
}
```

### Log Output

```css
:root {
  --log-font-family:      var(--font-mono);
  --log-font-size:        var(--text-mono);
  --log-line-height:      var(--leading-mono);
  --log-bg:               var(--color-bg);
  --log-border:           var(--color-border);
  --log-radius:           var(--radius-md);
  --log-padding:          12px 16px;
  --log-line-number-color:var(--color-text-tertiary);
  --log-line-number-width:40px;
  --log-timestamp-color:  var(--color-text-tertiary);
  --log-timestamp-size:   var(--text-mono-sm);
}
```

### Sidebar

```css
:root {
  --sidebar-bg:             var(--color-surface);
  --sidebar-border:         var(--color-border);
  --sidebar-item-height:    40px;
  --sidebar-item-radius:    var(--radius-md);
  --sidebar-item-padding:   0 12px;
  --sidebar-item-gap:       2px;
  --sidebar-item-text:      var(--color-text-secondary);
  --sidebar-item-icon-size: 20px;
  --sidebar-item-icon-color:var(--color-text-tertiary);
  --sidebar-active-bg:      var(--color-primary-light);
  --sidebar-active-text:    var(--color-primary);
  --sidebar-active-accent:  3px solid var(--color-primary);
  --sidebar-hover-bg:       var(--color-border-light);
  --sidebar-section-gap:    24px;
}
```

### Header

```css
:root {
  --header-bg:              var(--color-surface);
  --header-border:          var(--color-border);
  --header-padding-x:       24px;
}
```

---

## 8. Transitions

```css
:root {
  --transition-fast:    150ms ease;
  --transition-normal:  200ms ease;
  --transition-slow:    300ms ease;
}
```

---

## 9. Typography Utility Classes

```css
.text-display {
  font-family: var(--font-sans);
  font-size: var(--text-display);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-display);
  letter-spacing: var(--tracking-heading);
  color: var(--color-text-primary);
}

.text-h1 {
  font-family: var(--font-sans);
  font-size: var(--text-h1);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-h1);
  letter-spacing: var(--tracking-heading);
  color: var(--color-text-primary);
}

.text-h2 {
  font-family: var(--font-sans);
  font-size: var(--text-h2);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-h2);
  letter-spacing: var(--tracking-heading);
  color: var(--color-text-primary);
}

.text-h3 {
  font-family: var(--font-sans);
  font-size: var(--text-h3);
  font-weight: var(--weight-semibold);
  line-height: var(--leading-h3);
  color: var(--color-text-primary);
}

.text-body {
  font-family: var(--font-sans);
  font-size: var(--text-body);
  font-weight: var(--weight-normal);
  line-height: var(--leading-body);
  color: var(--color-text-secondary);
}

.text-body-medium {
  font-family: var(--font-sans);
  font-size: var(--text-body);
  font-weight: var(--weight-medium);
  line-height: var(--leading-body);
  color: var(--color-text-primary);
}

.text-caption {
  font-family: var(--font-sans);
  font-size: var(--text-caption);
  font-weight: var(--weight-normal);
  line-height: var(--leading-caption);
  color: var(--color-text-tertiary);
}

.text-small {
  font-family: var(--font-sans);
  font-size: var(--text-small);
  font-weight: var(--weight-normal);
  line-height: var(--leading-caption);
  color: var(--color-text-tertiary);
}

.text-mono {
  font-family: var(--font-mono);
  font-size: var(--text-mono);
  font-weight: var(--weight-normal);
  line-height: var(--leading-mono);
  letter-spacing: var(--tracking-normal);
}

.text-mono-sm {
  font-family: var(--font-mono);
  font-size: var(--text-mono-sm);
  font-weight: var(--weight-normal);
  line-height: var(--leading-mono);
  letter-spacing: var(--tracking-normal);
  color: var(--color-text-tertiary);
}
```
