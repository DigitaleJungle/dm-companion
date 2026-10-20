//! The one dice parser and roller. Notation: terms joined by `+` or `-`, where a term is a number
//! or `NdM` with an optional keep/drop suffix: `kh`, `kl`, `dh` or `dl` followed by a count.
//! Examples: `4d6kh3`, `2d20kh1+4`, `1d8-1`, `d20`.

use serde::Serialize;
use std::collections::hash_map::RandomState;
use std::hash::{BuildHasher, Hasher};
use std::sync::atomic::{AtomicU64, Ordering};

const MAX_DICE: u32 = 100;
const MAX_FACES: u32 = 1000;

#[derive(Debug, Clone, Copy, PartialEq)]
enum Keep {
    All,
    Highest(u32),
    Lowest(u32),
    DropHighest(u32),
    DropLowest(u32),
}

#[derive(Debug, Clone, PartialEq)]
enum Term {
    Number(i64),
    Dice { count: u32, faces: u32, keep: Keep },
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Die {
    pub faces: u32,
    pub value: u32,
    pub kept: bool,
}

#[derive(Debug, Clone, PartialEq, Serialize)]
pub struct Roll {
    pub notation: String,
    pub total: i64,
    pub dice: Vec<Die>,
}

fn number(chars: &[char], i: &mut usize) -> Option<u64> {
    let start = *i;
    while *i < chars.len() && chars[*i].is_ascii_digit() {
        *i += 1;
    }
    chars[start..*i].iter().collect::<String>().parse().ok()
}

fn parse(notation: &str) -> Result<Vec<(i64, Term)>, String> {
    let bad = || format!("\"{notation}\" isn't dice notation (try something like 2d20kh1+4).");
    let chars: Vec<char> = notation.chars().filter(|c| !c.is_whitespace()).flat_map(char::to_lowercase).collect();
    if chars.is_empty() {
        return Err(bad());
    }
    let (mut terms, mut i, mut total_dice) = (vec![], 0, 0u32);
    while i < chars.len() {
        let sign = match chars[i] {
            '+' if !terms.is_empty() => { i += 1; 1 }
            '-' => { i += 1; -1 }
            _ if terms.is_empty() => 1,
            _ => return Err(bad()),
        };
        let lead = number(&chars, &mut i);
        if chars.get(i) != Some(&'d') {
            let n = lead.ok_or_else(bad)?;
            terms.push((sign, Term::Number(i64::try_from(n).map_err(|_| bad())?)));
            continue;
        }
        i += 1;
        let count = u32::try_from(lead.unwrap_or(1)).map_err(|_| bad())?;
        let faces = number(&chars, &mut i).ok_or_else(bad)?;
        if count == 0 || faces == 0 {
            return Err(bad());
        }
        if faces > u64::from(MAX_FACES) {
            return Err(format!("Dice can have at most {MAX_FACES} faces."));
        }
        total_dice = total_dice.saturating_add(count);
        if total_dice > MAX_DICE {
            return Err(format!("Roll at most {MAX_DICE} dice at once."));
        }
        let keep = match (chars.get(i), chars.get(i + 1)) {
            (Some(&a), Some(&b)) if matches!((a, b), ('k', 'h') | ('k', 'l') | ('d', 'h') | ('d', 'l')) => {
                i += 2;
                let n = u32::try_from(number(&chars, &mut i).ok_or_else(bad)?).map_err(|_| bad())?;
                if n > count {
                    return Err(bad());
                }
                match (a, b) {
                    ('k', 'h') => Keep::Highest(n),
                    ('k', 'l') => Keep::Lowest(n),
                    ('d', 'h') => Keep::DropHighest(n),
                    _ => Keep::DropLowest(n),
                }
            }
            _ => Keep::All,
        };
        terms.push((sign, Term::Dice { count, faces: faces as u32, keep }));
    }
    Ok(terms)
}

/// Rolls `notation`, using `die(faces)` for each die (it must return 1..=faces).
pub fn roll_with(notation: &str, mut die: impl FnMut(u32) -> u32) -> Result<Roll, String> {
    let (mut total, mut dice) = (0i64, vec![]);
    for (sign, term) in parse(notation)? {
        match term {
            Term::Number(n) => total += sign * n,
            Term::Dice { count, faces, keep } => {
                let values: Vec<u32> = (0..count).map(|_| die(faces)).collect();
                // Indexes sorted from lowest to highest value; ties keep their roll order.
                let mut order: Vec<usize> = (0..values.len()).collect();
                order.sort_by_key(|&i| values[i]);
                let n = values.len();
                let kept: Vec<usize> = match keep {
                    Keep::All => order,
                    Keep::Highest(k) => order[n - k as usize..].to_vec(),
                    Keep::Lowest(k) => order[..k as usize].to_vec(),
                    Keep::DropHighest(k) => order[..n - k as usize].to_vec(),
                    Keep::DropLowest(k) => order[k as usize..].to_vec(),
                };
                for (i, &value) in values.iter().enumerate() {
                    let is_kept = kept.contains(&i);
                    if is_kept {
                        total += sign * i64::from(value);
                    }
                    dice.push(Die { faces, value, kept: is_kept });
                }
            }
        }
    }
    Ok(Roll { notation: notation.trim().to_string(), total, dice })
}

fn random_u64() -> u64 {
    // RandomState is seeded from the OS; hashing a counter gives a fresh value each call.
    static COUNTER: AtomicU64 = AtomicU64::new(0);
    let mut hasher = RandomState::new().build_hasher();
    hasher.write_u64(COUNTER.fetch_add(1, Ordering::Relaxed));
    hasher.finish()
}

/// A fair die: rejects the top sliver of u64 values so every face is equally likely.
fn random_die(faces: u32) -> u32 {
    let faces = u64::from(faces);
    let zone = u64::MAX - u64::MAX % faces;
    loop {
        let x = random_u64();
        if x < zone {
            return (x % faces) as u32 + 1;
        }
    }
}

pub fn roll(notation: &str) -> Result<Roll, String> {
    roll_with(notation, random_die)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn fixed(values: &[u32]) -> impl FnMut(u32) -> u32 + '_ {
        let mut it = values.iter();
        move |_| *it.next().expect("ran out of dice")
    }

    #[test]
    fn plain_dice_and_modifiers() {
        let r = roll_with("2d20 + 4", fixed(&[7, 15])).unwrap();
        assert_eq!(r.total, 26);
        assert!(r.dice.iter().all(|d| d.kept && d.faces == 20));
        assert_eq!(roll_with("1d8-1", fixed(&[5])).unwrap().total, 4);
        assert_eq!(roll_with("d20", fixed(&[12])).unwrap().total, 12);
        assert_eq!(roll_with("-1d4+3", fixed(&[2])).unwrap().total, 1);
        assert_eq!(roll_with("7", fixed(&[])).unwrap().total, 7);
    }

    #[test]
    fn keep_and_drop() {
        let r = roll_with("4d6kh3", fixed(&[3, 1, 6, 4])).unwrap();
        assert_eq!(r.total, 13);
        assert_eq!(r.dice.iter().map(|d| d.kept).collect::<Vec<_>>(), [true, false, true, true]);
        assert_eq!(roll_with("2d20kh1+4", fixed(&[7, 15])).unwrap().total, 19);
        assert_eq!(roll_with("2d20kl1", fixed(&[7, 15])).unwrap().total, 7);
        assert_eq!(roll_with("4d6dl1", fixed(&[3, 1, 6, 4])).unwrap().total, 13);
        assert_eq!(roll_with("3d6dh1", fixed(&[3, 1, 6])).unwrap().total, 4);
        // Ties: only one of the equal lowest dice is dropped.
        let r = roll_with("4D6KH3", fixed(&[2, 2, 5, 5])).unwrap();
        assert_eq!((r.total, r.dice.iter().filter(|d| !d.kept).count()), (12, 1));
    }

    #[test]
    fn rejects_bad_notation_and_limits() {
        for bad in ["", "d", "2d", "abc", "2d6+", "2d6++1", "0d6", "1d0", "2d6kh3", "2d6x", "1d6 1d6", "4d6kh"] {
            assert!(roll_with(bad, |_| 1).is_err(), "{bad} should be rejected");
        }
        assert!(roll_with("101d6", |_| 1).is_err());
        assert!(roll_with("60d6+60d6", |_| 1).is_err());
        assert!(roll_with("1d1001", |_| 1).is_err());
        assert!(roll_with("100d1000", |_| 1).is_ok());
    }

    #[test]
    fn random_dice_stay_in_range_and_hit_every_face() {
        let mut seen = [false; 6];
        for _ in 0..600 {
            let v = random_die(6);
            assert!((1..=6).contains(&v));
            seen[v as usize - 1] = true;
        }
        assert!(seen.iter().all(|&s| s));
        let r = roll("4d6kh3").unwrap();
        assert!((3..=18).contains(&r.total) && r.dice.len() == 4);
    }
}
