---
title: "Kafka Consumer Patterns You Should Know"
date: 2023-08-05
thumbnail: "/images/blog/kafka.jpg"
category: "Backend"
tags: ["Kafka", "Backend", "Distributed Systems"]
summary: "A deep dive into consumer group strategies, offset management, and handling rebalances gracefully — patterns that have saved us from data loss more than once."
---

Kafka is powerful, but its consumer semantics trip up most engineers the first time. The broker is simple — it's an append-only log. The complexity lives entirely on the **consumer side**: how you read, when you commit, and what happens during a rebalance.

This post walks through the patterns I keep coming back to.

## Consumer Groups Are the Unit of Scaling

A consumer group is just a set of consumers sharing a `group.id`. Kafka guarantees that **each partition is consumed by exactly one consumer** within a group at any time.

![Partitions distributed across consumers in a group](/images/blog/kafka-diagram.jpg)

That single rule drives everything:

- More consumers than partitions? The extras sit idle.
- Fewer consumers than partitions? Some consumers handle multiple partitions.
- A consumer dies? Its partitions are reassigned to the survivors.

> Rule of thumb: your maximum parallelism equals your partition count. Pick partition counts with future throughput in mind — you can add partitions later, but it disrupts ordering.

## Offset Management: Where Most Bugs Live

The offset is your bookmark in the log. The dangerous default is **auto-commit**:

```properties
enable.auto.commit=true
auto.commit.interval.ms=5000
```

This commits offsets on a timer regardless of whether you actually finished processing. If your app crashes after auto-commit but before processing completes, those messages are **lost**.

For anything that matters, commit manually *after* the work is done:

```java
while (running) {
    var records = consumer.poll(Duration.ofMillis(100));
    for (var record : records) {
        process(record);          // do the work first
    }
    consumer.commitSync();         // then move the bookmark
}
```

This gives you **at-least-once** delivery: a crash means you reprocess, never skip. Make `process()` idempotent and you're safe.

## Handling Rebalances Gracefully

A rebalance happens whenever group membership changes. During one, partitions are revoked and reassigned — and if you're holding uncommitted work, you can duplicate or drop it.

Use a `ConsumerRebalanceListener` to commit before partitions are taken away:

```java
consumer.subscribe(topics, new ConsumerRebalanceListener() {
    public void onPartitionsRevoked(Collection<TopicPartition> partitions) {
        consumer.commitSync(currentOffsets);
    }
    public void onPartitionsAssigned(Collection<TopicPartition> partitions) {
        // warm caches, seek to a custom position, etc.
    }
});
```

## Quick Checklist

| Concern | Pattern |
|---|---|
| Throughput | Partitions ≥ consumers |
| Delivery | Manual commit, idempotent processing |
| Rebalances | Commit in `onPartitionsRevoked` |
| Poison messages | Dead-letter topic after N retries |

Get these four right and Kafka stops being scary. The log was never the hard part — your consumer's contract with it is.
