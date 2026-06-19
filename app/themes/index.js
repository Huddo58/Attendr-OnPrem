// app/themes/index.js
// Built-in theme registry for the Attenddr theme engine.
//
// Each theme defines CSS custom property values (tokens) that override
// the default brand-colour-derived tokens injected by server.js.
//
// KEY DESIGN RULE: theme the chrome, protect the data.
// Status badge colours (.black, .blue, .green, …) are data-semantic
// and intentionally NOT controlled by themes.

const THEMES = [
    {
        key:   'christmas',
        label: 'Christmas',
        // Tasteful winter palette — no full-strength red/green.
        // Gradient: icy blue → deep forest. Accent: muted crimson.
        tokens: {
            bg_start:            '#b5d5f5',           // muted icy blue
            bg_end:              '#1a472a',            // deep forest green
            header_bg:           'rgba(26,71,42,0.82)',
            header_border:       'rgba(255,255,255,0.20)',
            header_text:         '#ffffff',
            header_banner:       'none',
            header_banner_blend: 'normal',
            tabs_bg:             'rgba(26,71,42,0.55)',
            tabs_border:         'rgba(255,255,255,0.20)',
            card_bg:             'rgba(255,255,255,0.96)',
            text_on_chrome:      '#ffffff',
            text_heading:        '#1a472a',
            accent:              '#c41e3a',            // muted crimson
            accent_text:         '#ffffff',
            popup_header_bg:     '#1a472a',
            popup_header_text:   '#ffffff',
            footer_text:         'rgba(255,255,255,0.80)',
        }
    }
];

/**
 * Look up a theme by key. Returns the theme object or null.
 * @param {string|null} key
 */
function getTheme(key) {
    if (!key) return null;
    return THEMES.find(t => t.key === key) || null;
}

/**
 * Build the full token map for the active theme.
 * When no theme is active the tokens are derived from the brand colour
 * (maintaining the existing branding behaviour exactly).
 *
 * @param {string|null} themeKey   - active_theme from branding_settings
 * @param {string}      brandColor - brand_color from branding_settings
 * @param {string}      lightColor - pre-computed brand_color_light
 * @returns {Object}   token map (keys match CSS custom property suffixes)
 */
function resolveTokens(themeKey, brandColor, lightColor) {
    const theme = getTheme(themeKey);

    if (theme) {
        return { ...theme.tokens };
    }

    // Default: derive from brand colour
    return {
        bg_start:            lightColor,
        bg_end:              brandColor,
        header_bg:           'rgba(255,255,255,0.10)',
        header_border:       'rgba(255,255,255,0.25)',
        header_text:         '#ffffff',
        header_banner:       'none',
        header_banner_blend: 'normal',
        tabs_bg:             'rgba(255,255,255,0.15)',
        tabs_border:         'rgba(255,255,255,0.25)',
        card_bg:             'rgba(255,255,255,0.96)',
        text_on_chrome:      '#ffffff',
        text_heading:        '#0d2b4d',
        accent:              '#005DFF',
        accent_text:         '#ffffff',
        popup_header_bg:     '#0b3c6e',
        popup_header_text:   '#ffffff',
        footer_text:         'rgba(255,255,255,0.75)',
    };
}

module.exports = { THEMES, getTheme, resolveTokens };
