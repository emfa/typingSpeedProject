import { Component, OnInit } from '@angular/core';

@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss']
})
export class AppComponent implements OnInit {
  title = 'typingSpeedProject';
  buttonText = 'Start';
  messageText = '';
  totalTime: number;
  speed: number;
  wordsList = [
    "Browser application bundle generation complete",
    "Introducing ChatGPT and Whisper APIs",
    "The reason you need to know Javascript is because APIs are coded in Javascript",
    "No learning a new language and its fancy syntax required",
    "Generate a hash from a string",
    "Fetches the value of GET variables in the API query",
    "Defaults to null if the requested GET variable is undefined.",
    "You can also access some internal variables as well with getVar."
  ];
  textWords: HTMLTextAreaElement;
  startTime: number;
  endTime: number;

  ngOnInit(): void {
    this.textWords = document.getElementById('myWords') as HTMLTextAreaElement;
    this.textWords.disabled = true;
  }

  clickButton(): void {
    const myButton = document.getElementById('btn');
    myButton.click();
  }

  toggleButtonText(): void {
    if (this.buttonText === 'Start') {
      this.startGame();
    } else {
      this.endGame();
    }
  }

  startGame(): void {
    this.resetTextArea();
    this.textWords.disabled = false;
    this.textWords.focus();
    const randomNum = Math.floor(Math.random() * this.wordsList.length);
    this.messageText = this.wordsList[randomNum];
    this.buttonText = 'Done';
    this.startTime = Date.now();
  }

  endGame(): void {
    this.textWords.disabled = true;
    this.endTime = Date.now();
    this.totalTime = Math.floor((this.endTime - this.startTime) / 1000);
    this.findSpeed();
    this.buttonText = 'Start';
  }

  resetTextArea(): void {
    this.textWords.value = '';
  }

  findSpeed(): void {
    const cleanText = this.textWords.value.replace(/\n|\t|\r|\\/g, "");
    const wordsList = (cleanText !== '') ? cleanText.split(" ") : [];
    const wordsCount = (cleanText !== '') ? cleanText.split(" ").length : 0;
    const displayedWordsCount = this.messageText.split(' ').length;

    this.speed = Math.round((wordsCount / this.totalTime) * 60);
    const errors = this.findErrors(wordsList);
    const matchingItems = displayedWordsCount - errors;
    const finalMessage = `You typed at the speed of ${this.speed} words per minute, ${matchingItems} correct out of ${displayedWordsCount} words and the total number of errors are ${errors}.`;
    this.messageText = finalMessage;
  }

  findErrors(userWords: string[]): number {
    const displayedWords = this.messageText.split(' ');
    const count: { [key: string]: number } = {};
    let matchingItems = 0;

    userWords.forEach((word) => {
      count[word] = (count[word] || 0) + 1;
    });

    displayedWords.forEach((word) => {
      if (count[word]) {
        matchingItems++;
        count[word]--;
      }
    });

    return displayedWords.length - matchingItems;
  }
}
