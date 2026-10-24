// The 10-question fractions check: form A before world 1, form B after world 2.
// The two forms ask the same kinds of question in the same order with different numbers,
// so the before and after scores compare fairly.

export interface Question {
  prompt: string;
  /** The first option is always the right one; the screen shuffles them. */
  options: string[];
}

export const BEFORE: Question[] = [
  { prompt: 'Which is equal to 1/2?', options: ['2/4', '1/3', '2/3', '1/4'] },
  { prompt: 'Which is equal to 3/4?', options: ['6/8', '3/8', '4/3', '2/4'] },
  { prompt: '2/3 = ?/9', options: ['6', '3', '4', '5'] },
  { prompt: 'Which is bigger?', options: ['7/10', '3/5', 'They are equal'] },
  { prompt: 'Which is NOT equal to 2/5?', options: ['3/10', '4/10', '6/15', '8/20'] },
  { prompt: '0.7 is the same as…', options: ['7/10', '7/100', '1/7', '70/10'] },
  { prompt: '0.25 is the same as…', options: ['1/4', '2/5', '1/25', '25/10'] },
  { prompt: '1/2 is what percent?', options: ['50%', '20%', '12%', '2%'] },
  { prompt: '3/5 is what percent?', options: ['60%', '35%', '30%', '53%'] },
  { prompt: '45/100 as a decimal is…', options: ['0.45', '4.5', '0.045', '45'] },
];

export const AFTER: Question[] = [
  { prompt: 'Which is equal to 1/3?', options: ['2/6', '1/6', '3/1', '2/3'] },
  { prompt: 'Which is equal to 2/5?', options: ['4/10', '2/10', '5/2', '4/5'] },
  { prompt: '3/4 = ?/12', options: ['9', '3', '6', '8'] },
  { prompt: 'Which is bigger?', options: ['5/6', '2/3', 'They are equal'] },
  { prompt: 'Which is NOT equal to 3/4?', options: ['3/8', '6/8', '9/12', '15/20'] },
  { prompt: '0.3 is the same as…', options: ['3/10', '3/100', '1/3', '30/10'] },
  { prompt: '0.75 is the same as…', options: ['3/4', '7/5', '1/75', '75/10'] },
  { prompt: '1/4 is what percent?', options: ['25%', '40%', '14%', '4%'] },
  { prompt: '4/5 is what percent?', options: ['80%', '45%', '40%', '54%'] },
  { prompt: '62/100 as a decimal is…', options: ['0.62', '6.2', '0.062', '62'] },
];

export function score(questions: Question[], answers: string[]): number {
  return questions.filter((q, i) => answers[i] === q.options[0]).length;
}
