// ── Calificación offline de respuestas escritas ─────────────────────────────
// Sin IA: compara lo que el usuario teclea contra la(s) respuesta(s) esperada(s)
// de forma tolerante (ignora tildes, artículos, mayúsculas, puntuación y perdona
// pequeños errores de tipeo). Se usa en los modos "escribe la traducción" y
// "escribe un sinónimo".

// Normaliza una cadena para comparar: minúsculas, sin tildes, sin puntuación,
// sin artículos/“to” de infinitivo, espacios colapsados.
export function normalizeAnswer(s) {
    return (s || '')
        .toLowerCase()
        .normalize('NFD').replace(/[̀-ͯ]/g, '')      // quita tildes/acentos
        .replace(/[.,;:!?¡¿"'()[\]]/g, ' ')                    // quita puntuación
        .replace(/\b(el|la|los|las|un|una|unos|unas|lo|to|the|a|an)\b/g, ' ')  // artículos / infinitivo
        .replace(/\s+/g, ' ')
        .trim();
}

// Distancia de edición Damerau-Levenshtein (OSA): inserción, borrado y
// sustitución cuestan 1, y la transposición de dos letras adyacentes (typo
// clásico "lorgar"→"lograr") también cuenta como 1.
export function levenshtein(a, b) {
    if (a === b) return 0;
    if (!a.length) return b.length;
    if (!b.length) return a.length;
    const d = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
    for (let i = 0; i <= a.length; i++) d[i][0] = i;
    for (let j = 0; j <= b.length; j++) d[0][j] = j;
    for (let i = 1; i <= a.length; i++) {
        for (let j = 1; j <= b.length; j++) {
            const cost = a[i - 1] === b[j - 1] ? 0 : 1;
            d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
            if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) {
                d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);  // transposición
            }
        }
    }
    return d[a.length][b.length];
}

// Cuántos typos se perdonan según el largo de la palabra esperada.
function tolerance(len) {
    if (len <= 4) return 0;   // palabras cortas: exacto (evita cat/car)
    if (len <= 7) return 1;
    return 2;
}

// Compara `input` contra una respuesta esperada que puede traer varias variantes
// separadas por coma, punto y coma o barra (p. ej. "lograr, conseguir, alcanzar").
// Devuelve { correct, exact, matched }.
export function checkAnswer(input, expectedRaw) {
    const inN = normalizeAnswer(input);
    if (!inN) return { correct: false, exact: false, matched: null };

    const variants = String(expectedRaw || '')
        .split(/[,;/]/)
        .map(normalizeAnswer)
        .filter(Boolean);

    for (const v of variants) {
        if (inN === v) return { correct: true, exact: true, matched: v };
    }
    for (const v of variants) {
        if (levenshtein(inN, v) <= tolerance(v.length)) {
            return { correct: true, exact: false, matched: v };
        }
    }
    return { correct: false, exact: false, matched: null };
}

// Igual que checkAnswer pero contra una LISTA de respuestas válidas (sinónimos).
export function checkAgainstList(input, list) {
    const inN = normalizeAnswer(input);
    if (!inN) return { correct: false, exact: false, matched: null };
    const items = (Array.isArray(list) ? list : []).map(normalizeAnswer).filter(Boolean);
    for (const v of items) {
        if (inN === v) return { correct: true, exact: true, matched: v };
    }
    for (const v of items) {
        if (levenshtein(inN, v) <= tolerance(v.length)) {
            return { correct: true, exact: false, matched: v };
        }
    }
    return { correct: false, exact: false, matched: null };
}
