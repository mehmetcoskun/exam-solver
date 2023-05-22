import express from 'express';
import cors from 'cors';
import * as cheerio from 'cheerio';
import fs from 'fs';
import { Configuration, OpenAIApi } from 'openai';
import axios from 'axios';
import 'dotenv/config';

const app = express();

app.use(cors());
app.use(express.json());

const configuration = new Configuration({
	apiKey: process.env.OPENAI_API_KEY,
});
const openai = new OpenAIApi(configuration);

const systemPrompt = `
Sen bir profesyonel sınav sorusu çözücüsüsün. senin görevin soruları çözmek. soruları çözdükten sonra cevapları bana gönder.
Örnek soru:
Soru 1: 2+2 kaçtır?
A) 1
B) 2
C) 3
D) 4

Cevap: D

Sorunun sadece cevabını yaz. Açıklama yazma.
`;

app.get('/', (req, res) => {
	const html = fs.readFileSync('sinav.html');
	const $ = cheerio.load(html);

	const questions = [];

	$("div[id^='soru']").each((index, el) => {
		const question = $(el).find('p:not([class])').text().trim();
		const choices = $(el)
			.find('.radio')
			.map(function (i, el) {
				const id = $(el).find('input').attr('id');
				const choice = $(el).text().trim().replace(id, '');
				return choice;
			})
			.get();

		if (choices.length > 0) {
			const prompt = `${question}\n\n${choices.join('\n')}`;

			questions.push(prompt);
		}
	});

	async function askQuestions() {
		for (let i = 0; i < questions.length; i++) {
			const prompt = questions[i];

			const completion = await openai.createChatCompletion({
				model: 'gpt-3.5-turbo',
				messages: [
					{ role: 'system', content: systemPrompt },
					{ role: 'user', content: prompt },
				],
			});

			await axios.post(
				process.env.WHATSAPP_WEBHOOK_URL,
				{
					chatId: process.env.WHATSAPP_CHAT_ID,
					text:
						questions[i] +
						'\n-----------------------------\n' +
						completion.data.choices[0].message.content,
					session: 'default',
				},
				{
					headers: {
						accept: 'application/json',
						'Content-Type': 'application/json',
					},
				}
			);
		}
	}

	askQuestions();
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
	console.log(`Server running on http://localhost:${PORT}`);
});
