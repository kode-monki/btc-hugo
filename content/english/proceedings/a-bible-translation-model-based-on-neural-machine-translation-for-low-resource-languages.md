---
title: "A Bible Translation Model Based on Neural Machine Translation for Low-Resource Languages"
date: 1899-12-30T00:00:00Z
author: "Sangrok Lee; David Hwang; Taeho Jang"
author_id: "#N/A"
year: "2023"
track: ["Language technology and Artificial Intelligence"]
slides_url: ""
paper_url: ""
video_url: ""
---

There are many low-resource languages around the world that have yet to receive a translation of the Bible. Specifically, while the New Testament has been translated into 1,617 languages, the Old Testament has not. To address this gap, we are working on a year-long project to build an NMT model that can automatically translate the Old Testament using data from existing New Testament translations. To achieve high-quality translation, we are using the state-of-the-art Transformer natural language processing technique. However, building an NMT model requires a vast amount of sentence-pairs, and the dataset generated from translating 7,959 verses of the New Testament is not enough. Therefore, we will utilize data augmentation, sub-word tokenization, and transfer learning with multi-NMT techniques to build an NMT model that can produce a good draft translation of the Old Testament.
We have chosen Korean as the source language and an Altaic language as the target language. In addition to manually translated sentence-pairs, we will also use a parallel lexicon with approximately 3,500 entries that includes proper and special nouns found in the Bible to train the model. Since both the source and target languages are agglutinative languages, we will apply an embedding technique based on sub-word tokenization through morphological analysis. Furthermore, we will create an experimental multi-NMT model using Korean and English as the source languages and compare it to the model trained with only one source language.
Currently, our year-long project is in its final stage, and we will report detailed results at an upcoming conference.
